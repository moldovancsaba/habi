import hashlib
import json
import urllib.error
import urllib.request


MAX_RESPONSE_BYTES = 1_048_576
REQUEST_TIMEOUT_SECONDS = 8
GENERATION_TIMEOUT_SECONDS = 120


class WorkerDependencyError(RuntimeError):
    pass


def _request_json(url, payload=None, timeout=REQUEST_TIMEOUT_SECONDS):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise WorkerDependencyError("OLLAMA_UNAVAILABLE") from error
    if len(body) > MAX_RESPONSE_BYTES:
        raise WorkerDependencyError("OLLAMA_RESPONSE_TOO_LARGE")
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WorkerDependencyError("OLLAMA_RESPONSE_INVALID") from error


def verify_local_runtime(config):
    version = _request_json(config.ollama_origin + "/api/version")
    if not isinstance(version.get("version"), str) or not version["version"]:
        raise WorkerDependencyError("OLLAMA_VERSION_INVALID")

    tags = _request_json(config.ollama_origin + "/api/tags")
    models = tags.get("models")
    if not isinstance(models, list):
        raise WorkerDependencyError("OLLAMA_MODEL_LIST_INVALID")
    match = next((item for item in models if item.get("name") == config.model), None)
    if match is None:
        raise WorkerDependencyError("OLLAMA_MODEL_MISSING")
    expected_digest = config.model_digest.removeprefix("sha256:")
    if match.get("digest") != expected_digest:
        raise WorkerDependencyError("OLLAMA_MODEL_DIGEST_MISMATCH")

    try:
        with open(config.prompt_path, "rb") as prompt_file:
            prompt_hash = hashlib.sha256(prompt_file.read()).hexdigest()
    except OSError as error:
        raise WorkerDependencyError("WORKER_PROMPT_UNAVAILABLE") from error
    if prompt_hash != config.prompt_hash:
        raise WorkerDependencyError("WORKER_PROMPT_HASH_MISMATCH")

    return {
        "model": config.model,
        "modelDigest": config.model_digest,
        "ollamaVersion": version["version"],
        "promptHash": prompt_hash,
    }


def run_local_smoke(config):
    release = verify_local_runtime(config)
    result = _request_json(
        config.ollama_origin + "/api/generate",
        {
            "model": config.model,
            "prompt": "Local synthetic worker check. Reply with exactly HABI_LOCAL_MODEL_OK and no other text.",
            "stream": False,
            "keep_alive": "5m",
            "options": {"temperature": 0, "num_predict": 16},
        },
        timeout=GENERATION_TIMEOUT_SECONDS,
    )
    if result.get("done") is not True or result.get("response", "").strip() != "HABI_LOCAL_MODEL_OK":
        raise WorkerDependencyError("OLLAMA_SMOKE_OUTPUT_INVALID")
    return {**release, "inference": "passed"}
