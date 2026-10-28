"""Server-only client for the shared Hetzner asynchronous job API."""
import hashlib
import json
import random
import time
import urllib.error
import urllib.parse
import urllib.request

from habi_worker.local_runtime import WorkerDependencyError


MAX_REQUEST_CHARS = 14_000
MAX_RESPONSE_BYTES = 1_048_576
MAX_JOB_SECONDS = 300
POLL_SECONDS = 3
SERVICE_OUTPUT_LIMITS = {}
SERVICE_MODELS = {}
SERVICE_CONTEXT_LIMITS = {}


class SharedAIError(WorkerDependencyError):
    pass


class SharedAICancelled(SharedAIError):
    pass


def _request(config, method, path, payload=None, idempotency_key=None, timeout=15):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {"Accept": "application/json", "Authorization": "Bearer " + config.shared_ai_key}
    if getattr(config, "shared_ai_request_purpose", None) == "test":
        headers["X-Request-Purpose"] = "test"
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = urllib.request.Request(config.shared_ai_origin + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise SharedAIError("SHARED_AI_RESPONSE_TOO_LARGE")
            return response.status, json.loads(raw.decode("utf-8")) if raw else None, response.headers
    except urllib.error.HTTPError as error:
        retry_after = error.headers.get("Retry-After")
        if error.code == 429:
            raise _retryable("SHARED_AI_CAPACITY", retry_after) from error
        if error.code in (502, 503, 504):
            try:
                payload = json.loads(error.read(4096))
                maintenance = payload.get("error", {}).get("code") == "model_storage_maintenance"
            except (ValueError, TypeError, AttributeError):
                maintenance = False
            raise _retryable("SHARED_AI_MAINTENANCE" if maintenance else "SHARED_AI_UNAVAILABLE", retry_after) from error
        if error.code == 404:
            raise SharedAIError("SHARED_AI_JOB_EXPIRED") from error
        if error.code in (401, 403):
            raise SharedAIError("SHARED_AI_AUTHORIZATION_FAILED") from error
        if error.code == 409:
            raise SharedAIError("SHARED_AI_IDEMPOTENCY_CONFLICT") from error
        raise SharedAIError("SHARED_AI_REQUEST_REJECTED") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise _retryable("SHARED_AI_UNAVAILABLE") from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SharedAIError("SHARED_AI_RESPONSE_INVALID") from error


class _Retryable(Exception):
    def __init__(self, code, retry_after=None):
        self.code = code
        self.retry_after = retry_after


def _retryable(code, retry_after=None):
    return _Retryable(code, retry_after)


def _wait(retry_after, attempt):
    try:
        delay = min(max(float(retry_after), 0), 15) if retry_after else min(2 ** attempt, 8)
    except (TypeError, ValueError):
        delay = min(2 ** attempt, 8)
    time.sleep(delay + random.uniform(0, 0.25))


def _authorized_capabilities(config):
    _, job_types, _ = _request(config, "GET", "/job-types")
    _, models, _ = _request(config, "GET", "/models")
    types = job_types.get("job_types", {}) if isinstance(job_types, dict) else {}
    permitted = isinstance(types, dict) and isinstance(types.get("text_chat"), dict)
    if not permitted:
        raise SharedAIError("SHARED_AI_TEXT_CHAT_NOT_PERMITTED")
    if not isinstance(models, dict) or not isinstance(models.get("data"), list):
        raise SharedAIError("SHARED_AI_MODELS_INVALID")
    return {"jobTypes": types, "models": models["data"]}


def validate_service(config):
    """Discover the service permissions and model catalogue at worker startup."""
    try:
        catalog = _authorized_capabilities(config)
    except _Retryable as error:
        raise SharedAIError(error.code) from error
    permitted_models = catalog["jobTypes"]["text_chat"].get("available_models", [])
    SERVICE_MODELS[config.shared_ai_origin] = set(permitted_models)
    for item in catalog["models"]:
        profile = item.get("rankings", {}).get("text_chat", {}).get("profile", {})
        if item.get("id") in permitted_models:
            SERVICE_OUTPUT_LIMITS[(config.shared_ai_origin, item["id"])] = min(max(int(profile.get("max_output_tokens", 512)), 128), 2048)
            SERVICE_CONTEXT_LIMITS[(config.shared_ai_origin, item["id"])] = int(profile.get("num_ctx", 2048))
    selected_model = catalog["jobTypes"]["text_chat"].get("model") if config.shared_ai_model == "auto" else config.shared_ai_model
    model = next((m for m in catalog["models"] if m.get("id")==selected_model), {})
    profile = model.get("rankings", {}).get("text_chat", {}).get("profile", {})
    SERVICE_OUTPUT_LIMITS[(config.shared_ai_origin,config.shared_ai_model)] = min(max(int(profile.get("max_output_tokens",512)),128),2048)
    SERVICE_CONTEXT_LIMITS[(config.shared_ai_origin, config.shared_ai_model)] = int(profile.get("num_ctx", 2048))
    if config.shared_ai_model != "auto":
        available = catalog["jobTypes"]["text_chat"].get("available_models", [])
        permitted = config.shared_ai_model in available
        if not permitted:
            raise SharedAIError("SHARED_AI_MODEL_NOT_PERMITTED")
    dialogue_model = getattr(config, "shared_ai_dialogue_model", "auto")
    if dialogue_model != "auto" and dialogue_model not in permitted_models:
        raise SharedAIError("SHARED_AI_MODEL_NOT_PERMITTED")
    return {"task": "text_chat", "model": config.shared_ai_model}


def _create_job(config, request_body, idempotency_key):
    for attempt in range(3):
        try:
            status, response, _ = _request(config, "POST", "/jobs", request_body, idempotency_key, timeout=20)
            if status not in (200, 202) or not isinstance(response, dict):
                raise SharedAIError("SHARED_AI_JOB_CREATE_INVALID")
            job_id = response.get("id")
            if not isinstance(job_id, str) or not job_id or len(job_id) > 256:
                raise SharedAIError("SHARED_AI_JOB_CREATE_INVALID")
            return job_id
        except _Retryable as error:
            if attempt == 2:
                raise SharedAIError(error.code) from error
            _wait(error.retry_after, attempt)
    raise SharedAIError("SHARED_AI_JOB_CREATE_FAILED")


def _json_answer(content, response_kind="claims"):
    """Accept a complete JSON object, including a fenced JSON response. Never repair partial JSON."""
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) > 2 and lines[-1].strip() == "```":
            text = "\n".join(lines[1:-1]).strip()
    try:
        generated = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        if start < 0:
            raise SharedAIError("SHARED_AI_RESULT_INVALID")
        try:
            generated, _ = json.JSONDecoder().raw_decode(text[start:])
        except json.JSONDecodeError as error:
            raise SharedAIError("SHARED_AI_RESULT_INVALID") from error
    if response_kind == "object":
        if not isinstance(generated, dict):
            raise SharedAIError("SHARED_AI_RESULT_INVALID")
        return generated
    if response_kind == "plain_text":
        if not isinstance(generated, dict) or not isinstance(generated.get("text"), str) or not generated["text"].strip():
            raise SharedAIError("SHARED_AI_RESULT_INVALID")
        return generated
    if not isinstance(generated, dict) or not isinstance(generated.get("claims"), list) or any(not isinstance(claim,dict) or not isinstance(claim.get("text"),str) or not isinstance(claim.get("sources",claim.get("evidenceRefs")),list) for claim in generated["claims"]):
        raise SharedAIError("SHARED_AI_RESULT_INVALID")
    return generated


def generate(config, system_prompt, user_prompt, revision_key, should_cancel=None, on_progress=None, response_kind="claims", history=None):
    """Run a bounded async request and retry malformed/truncated output once with more room."""
    deadline = time.monotonic() + MAX_JOB_SECONDS
    maximum=SERVICE_OUTPUT_LIMITS.get((config.shared_ai_origin,config.shared_ai_model),512)
    for output_attempt, token_limit in enumerate((max(128,maximum//2),maximum)):
        if should_cancel and should_cancel():
            raise SharedAICancelled("SHARED_AI_CANCELLED")
        if on_progress:
            on_progress("repairing" if output_attempt else "provider_queued")
        repair = ("\nAdj teljes JSON objektumot egyetlen text mezővel. Ne használj Markdown-kódblokkot." if response_kind == "plain_text" else "\nAdj teljes, érvényes JSON objektumot, legfeljebb két rövid állítással. Ne használj Markdown-kódblokkot.") if output_attempt else ""
        if response_kind == "conversation" and output_attempt:
            repair = "\nPlease give one complete concise reply to this latest message."
        request_body = {
            "task": "text_chat", "model": config.shared_ai_model,
            "input": {"messages": [{"role":"system", "content":system_prompt}] + (history or []) + [{"role":"user", "content":user_prompt + repair}],
                      "response_format":{"type":"json_object"}, "max_tokens":token_limit, "reasoning_effort":"none"},
        }
        if response_kind == "conversation":
            request_body["input"].pop("response_format", None)
        encoded = json.dumps(request_body, ensure_ascii=False, separators=(",", ":"))
        if len(encoded) > MAX_REQUEST_CHARS:
            raise SharedAIError("SHARED_AI_INPUT_TOO_LARGE")
        key_hash = hashlib.sha256((revision_key + "\n" + encoded).encode("utf-8")).hexdigest()
        job_id = _create_job(config, request_body, "habi-" + key_hash)
        last_status = None
        while time.monotonic() < deadline:
            if should_cancel and should_cancel():
                raise SharedAICancelled("SHARED_AI_CANCELLED")
            try:
                _, response, _ = _request(config, "GET", "/jobs/" + urllib.parse.quote(job_id, safe=""), timeout=15)
            except _Retryable as error:
                _wait(error.retry_after, 0)
                continue
            if not isinstance(response, dict):
                raise SharedAIError("SHARED_AI_JOB_STATUS_INVALID")
            status = response.get("status")
            if status != last_status and on_progress:
                on_progress("provider_queued" if status == "queued" else "generating" if status == "running" else "checking")
            last_status = status
            if status == "completed":
                result = response.get("result")
                choices = result.get("choices") if isinstance(result, dict) else None
                choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
                message = choice.get("message")
                content = message.get("content") if isinstance(message, dict) else None
                actual_model = result.get("model") or response.get("model") if isinstance(result, dict) else None
                try:
                    if not isinstance(content, str) or not isinstance(actual_model, str) or not actual_model:
                        raise SharedAIError("SHARED_AI_RESULT_INVALID")
                    if response_kind == "conversation":
                        if choice.get("finish_reason") == "length" or not content.strip():
                            raise SharedAIError("SHARED_AI_RESULT_INVALID")
                        try:
                            decoded = json.loads(content)
                            generated = decoded if isinstance(decoded, dict) and isinstance(decoded.get("text"), str) else {"text": content.strip()}
                        except ValueError:
                            generated = {"text": content.strip()}
                    else:
                        generated = _json_answer(content, response_kind)
                except SharedAIError:
                    # Log only structural metadata, never a prompt or response text.
                    print(json.dumps({"event":"habi.worker.output.retry", "attempt":output_attempt + 1, "finishReason":str(choice.get("finish_reason", "unknown"))[:30], "responseChars":len(content) if isinstance(content,str) else 0}), flush=True)
                    if output_attempt == 0:
                        break
                    raise
                return generated, actual_model
            if status == "failed":
                if output_attempt == 0:
                    break
                raise SharedAIError("SHARED_AI_JOB_FAILED")
            if status not in ("queued", "running"):
                raise SharedAIError("SHARED_AI_JOB_STATUS_INVALID")
            time.sleep(POLL_SECONDS)
        else:
            raise SharedAIError("SHARED_AI_JOB_TIMEOUT")
    raise SharedAIError("SHARED_AI_RESULT_INVALID")
