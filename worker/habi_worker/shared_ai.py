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


class SharedAIError(WorkerDependencyError):
    pass


def _request(config, method, path, payload=None, idempotency_key=None, timeout=15):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {"Accept": "application/json", "Authorization": "Bearer " + config.shared_ai_key}
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
            raise _retryable("SHARED_AI_UNAVAILABLE", retry_after) from error
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
    if config.shared_ai_model != "auto":
        available = catalog["jobTypes"]["text_chat"].get("available_models", [])
        permitted = config.shared_ai_model in available
        if not permitted:
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


def generate(config, system_prompt, user_prompt, revision_key):
    """Run a bounded async text job; retry creation only with a stable idempotency key."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    request_body = {
        "task": "text_chat",
        "model": config.shared_ai_model,
        "input": {
            "messages": messages,
            "response_format": {"type": "json_object"},
            "max_tokens": 512,
            "reasoning_effort": "none",
        },
    }
    encoded = json.dumps(request_body, ensure_ascii=False, separators=(",", ":"))
    if len(encoded) > MAX_REQUEST_CHARS:
        raise SharedAIError("SHARED_AI_INPUT_TOO_LARGE")
    key_hash = hashlib.sha256((revision_key + "\n" + encoded).encode("utf-8")).hexdigest()
    idempotency_key = "habi-" + key_hash
    job_id = _create_job(config, request_body, idempotency_key)
    deadline = time.monotonic() + MAX_JOB_SECONDS
    while time.monotonic() < deadline:
        try:
            _, response, _ = _request(config, "GET", "/jobs/" + urllib.parse.quote(job_id, safe=""), timeout=15)
        except _Retryable as error:
            _wait(error.retry_after, 0)
            continue
        if not isinstance(response, dict):
            raise SharedAIError("SHARED_AI_JOB_STATUS_INVALID")
        status = response.get("status")
        if status == "completed":
            result = response.get("result")
            if not isinstance(result, dict):
                raise SharedAIError("SHARED_AI_RESULT_INVALID")
            choices = result.get("choices")
            if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                raise SharedAIError("SHARED_AI_RESULT_INVALID")
            message = choices[0].get("message")
            content = message.get("content") if isinstance(message, dict) else None
            actual_model = result.get("model") or response.get("model")
            if not isinstance(content, str) or not isinstance(actual_model, str) or not actual_model:
                raise SharedAIError("SHARED_AI_RESULT_INVALID")
            try:
                generated = json.loads(content)
            except json.JSONDecodeError as error:
                raise SharedAIError("SHARED_AI_RESULT_INVALID") from error
            if not isinstance(generated, dict):
                raise SharedAIError("SHARED_AI_RESULT_INVALID")
            return generated, actual_model
        if status == "failed":
            raise SharedAIError("SHARED_AI_JOB_FAILED")
        if status not in ("queued", "running"):
            raise SharedAIError("SHARED_AI_JOB_STATUS_INVALID")
        time.sleep(POLL_SECONDS)
    raise SharedAIError("SHARED_AI_JOB_TIMEOUT")
