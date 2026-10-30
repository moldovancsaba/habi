"""Server-only client for the shared Hetzner asynchronous job API."""
import hashlib
import json
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from habi_worker.local_runtime import WorkerDependencyError


MAX_REQUEST_CHARS = 14_000
MAX_RESPONSE_BYTES = 1_048_576
MAX_JOB_SECONDS = 300
POLL_SECONDS = 3
# A conversation reply cut by the token limit is kept only if a whole answer remains.
MIN_TRIMMED_REPLY_CHARS = 20
_SENTENCE_END = re.compile(r"[.!?…]+(?:[^\w\s]|\s(?=[^\w\s]))*(?=\s|$)")
SERVICE_OUTPUT_LIMITS = {}
SERVICE_MODELS = {}
SERVICE_CONTEXT_LIMITS = {}
SERVICE_TASK_MODELS = {}


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
    for task, capability in catalog["jobTypes"].items():
        if task not in ("text_chat", "text_chat_hu") or not isinstance(capability, dict):
            continue
        permitted = set(capability.get("available_models", []))
        SERVICE_TASK_MODELS[(config.shared_ai_origin, task)] = permitted
        for model in catalog["models"]:
            if model.get("id") not in permitted:
                continue
            profile = model.get("rankings", {}).get(task, {}).get("profile", {})
            output = min(max(int(profile.get("max_output_tokens", 192 if task == "text_chat_hu" else 512)), 128), 192 if task == "text_chat_hu" else 2048)
            window = int(profile.get("num_ctx", 1024 if task == "text_chat_hu" else 2048))
            for name in (model["id"], "auto") if model["id"] == capability.get("model") else (model["id"],):
                SERVICE_OUTPUT_LIMITS[(config.shared_ai_origin, task, name)] = output
                SERVICE_CONTEXT_LIMITS[(config.shared_ai_origin, task, name)] = window
                if task == "text_chat":
                    SERVICE_OUTPUT_LIMITS[(config.shared_ai_origin, name)] = output
                    SERVICE_CONTEXT_LIMITS[(config.shared_ai_origin, name)] = window
    SERVICE_MODELS[config.shared_ai_origin] = SERVICE_TASK_MODELS.get((config.shared_ai_origin, "text_chat"), set())
    task = getattr(config, "shared_ai_task", "text_chat")
    dialogue_task = getattr(config, "shared_ai_dialogue_task", task)
    for requested_task, model in ((task, config.shared_ai_model), (dialogue_task, getattr(config, "shared_ai_dialogue_model", "auto"))):
        if requested_task not in catalog["jobTypes"]:
            raise SharedAIError("SHARED_AI_TASK_NOT_PERMITTED")
        if model != "auto" and model not in SERVICE_TASK_MODELS.get((config.shared_ai_origin, requested_task), set()):
            raise SharedAIError("SHARED_AI_MODEL_NOT_PERMITTED")
    return {"task": task, "model": config.shared_ai_model}


def service_limits(config):
    task = getattr(config, "shared_ai_task", "text_chat")
    key = (config.shared_ai_origin, task, config.shared_ai_model)
    legacy = (config.shared_ai_origin, config.shared_ai_model)
    output = SERVICE_OUTPUT_LIMITS.get(key, SERVICE_OUTPUT_LIMITS.get(legacy, 512) if task == "text_chat" else 192)
    window = SERVICE_CONTEXT_LIMITS.get(key, SERVICE_CONTEXT_LIMITS.get(legacy, 2048) if task == "text_chat" else 1024)
    cap = getattr(config, "shared_ai_output_tokens", None)
    return window, min(output, cap) if cap else output


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


def _ends_sentence(text, match):
    # "1." and "5." are list markers and Hungarian ordinals ("október 5."), not sentence ends.
    if not match.group().startswith("."):
        return True
    words = text[:match.start()].split()
    return not (words and words[-1].isdigit())


def _complete_sentences(text):
    """The complete sentences of a reply that the token limit cut off, or None.

    The cut text ends mid-word, so only a sentence end followed by a space can be
    trusted; a decimal point (7.5) is not one. A remainder too short to stand as
    an answer is refused, so the caller retries instead of showing "Igen."."""
    ends = [match.end() for match in _SENTENCE_END.finditer(text) if _ends_sentence(text, match)]
    if not ends:
        return None
    kept = text[:ends[-1]].strip()
    return kept if len(kept) >= MIN_TRIMMED_REPLY_CHARS else None


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
    _, maximum = service_limits(config)
    task = getattr(config, "shared_ai_task", "text_chat")
    for output_attempt, token_limit in enumerate((max(128,maximum//2),maximum)):
        if should_cancel and should_cancel():
            raise SharedAICancelled("SHARED_AI_CANCELLED")
        if on_progress:
            on_progress("repairing" if output_attempt else "provider_queued")
        repair = ("\nAdj teljes JSON objektumot egyetlen text mezővel. Ne használj Markdown-kódblokkot." if response_kind == "plain_text" else "\nAdj teljes, érvényes JSON objektumot, legfeljebb két rövid állítással. Ne használj Markdown-kódblokkot.") if output_attempt else ""
        if response_kind == "conversation" and output_attempt:
            repair = "\nRöviden." if task == "text_chat_hu" else "\nPlease give one complete concise reply to this latest message."
        request_body = {
            "task": task, "model": config.shared_ai_model,
            "input": {"messages": [{"role":"system", "content":system_prompt}] + (history or []) + [{"role":"user", "content":user_prompt + repair}],
                      "response_format":{"type":"json_object"}, "max_tokens":token_limit, "reasoning_effort":"none"},
        }
        if response_kind == "conversation":
            request_body["input"].pop("response_format", None)
        if task == "text_chat_hu":
            request_body["input"]["temperature"] = 0
            size = len(json.dumps(request_body["input"]["messages"], ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            if size > min(1000, 1024 - token_limit - 256):
                raise SharedAIError("SHARED_AI_INPUT_TOO_LARGE")
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
            if status in ("completed", "failed") and task == "text_chat_hu":
                try:
                    _request(config, "DELETE", "/jobs/" + urllib.parse.quote(job_id, safe=""))
                except (SharedAIError, _Retryable):
                    pass  # The service also expires terminal results automatically.
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
                        if not content.strip():
                            raise SharedAIError("SHARED_AI_RESULT_INVALID")
                        if choice.get("finish_reason") == "length":
                            # The retry has the same token limit and was cut off again every
                            # time it was seen, so keep the complete sentences instead. A cut
                            # JSON object is never trimmed into a fragment.
                            kept = None if content.lstrip().startswith("{") else _complete_sentences(content)
                            if kept is None:
                                raise SharedAIError("SHARED_AI_RESULT_INVALID")
                            print(json.dumps({"event":"habi.worker.output.trimmed", "attempt":output_attempt + 1, "responseChars":len(content), "keptChars":len(kept)}), flush=True)
                            content = kept
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
