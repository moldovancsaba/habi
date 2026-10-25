from dataclasses import dataclass, field, replace
from pathlib import Path
import re
from typing import Optional
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class WorkerConfig:
    mode: str
    host_lock_path: str
    ollama_origin: str
    model: str
    model_digest: str
    prompt_hash: str
    prompt_path: str
    cloud_api_origin: Optional[str] = None
    service_id: Optional[str] = None
    bearer_token: Optional[str] = field(default=None, repr=False)


def _validate_model_release(env):
    digest = env.get("HG_MODEL_DIGEST", "")
    prompt_hash = env.get("HG_PROMPT_HASH", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError("HG_MODEL_DIGEST must be a verified sha256 runtime manifest digest")
    if not re.fullmatch(r"[0-9a-f]{64}", prompt_hash):
        raise ValueError("HG_PROMPT_HASH must be a lowercase SHA-256 digest")


def _validate_local_ollama(env):
    origin = env.get("HG_OLLAMA_ORIGIN", "")
    parsed = urlparse(origin)
    if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("HG_OLLAMA_ORIGIN must use HTTP on the local model host")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("HG_OLLAMA_ORIGIN must be an origin without credentials, path, query, or fragment")
    return parsed.geturl().rstrip("/")


def _build_config(env, mode):
    missing = [
        key for key in ("HG_HOST_LOCK_PATH", "HG_MODEL", "HG_MODEL_DIGEST", "HG_PROMPT_HASH")
        if not env.get(key, "").strip()
    ]
    if missing:
        raise ValueError("Missing worker configuration: " + ", ".join(missing))
    _validate_model_release(env)
    ollama_origin = _validate_local_ollama(env)
    return WorkerConfig(
        mode=mode,
        host_lock_path=env["HG_HOST_LOCK_PATH"],
        ollama_origin=ollama_origin,
        model=env["HG_MODEL"],
        model_digest=env["HG_MODEL_DIGEST"],
        prompt_hash=env["HG_PROMPT_HASH"],
        prompt_path=env.get("HG_PROMPT_PATH", str(REPO_ROOT / "contracts" / "prompt.md")),
    )


def load_config(env):
    mode = env.get("HG_WORKER_MODE", "hosted").strip()
    if mode not in ("hosted", "local_test", "local_synthetic"):
        raise ValueError("HG_WORKER_MODE must be hosted, local_test, or local_synthetic")

    if mode == "local_synthetic":
        if env.get("HG_ENVIRONMENT") != "development" or env.get("HG_SYNTHETIC_DATA_ONLY") != "true":
            raise ValueError("local_synthetic worker requires development and synthetic-only mode")
        forbidden = [
            key for key in env
            if key.startswith(("HG_CLOUD_", "HG_WORKER_SERVICE_", "HG_WORKER_BEARER_", "HG_ATLAS_", "HG_SESSION_", "HG_REFRESH_", "HG_CURSOR_", "HG_SSO_", "HG_EXTERNAL_"))
            or "MONGODB" in key
        ]
        if forbidden:
            raise ValueError("Cloud and user credentials are forbidden in local_synthetic mode")
        return _build_config(env, mode)

    required = ("HG_CLOUD_API_ORIGIN", "HG_WORKER_SERVICE_ID", "HG_WORKER_BEARER_TOKEN")
    missing = [key for key in required if not env.get(key, "").strip()]
    if missing:
        raise ValueError("Missing worker configuration: " + ", ".join(missing))

    cloud = urlparse(env["HG_CLOUD_API_ORIGIN"])
    local_test = mode == "local_test"
    if local_test:
        if env.get("HG_ENVIRONMENT") != "test" or env.get("HG_SYNTHETIC_DATA_ONLY") != "true":
            raise ValueError("local_test worker requires test and synthetic-only mode")
        if cloud.scheme != "http" or cloud.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("local_test worker API must use localhost HTTP")
    elif cloud.scheme != "https":
        raise ValueError("HG_CLOUD_API_ORIGIN must be an HTTPS origin")
    if not cloud.netloc or cloud.username or cloud.password or cloud.query or cloud.fragment or cloud.path not in ("", "/"):
        raise ValueError("HG_CLOUD_API_ORIGIN must be an origin without credentials, path, query, or fragment")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", env["HG_WORKER_SERVICE_ID"]):
        raise ValueError("HG_WORKER_SERVICE_ID is invalid")
    if len(env["HG_WORKER_BEARER_TOKEN"].encode("utf-8")) < 32:
        raise ValueError("HG_WORKER_BEARER_TOKEN must contain at least 32 bytes")

    base = _build_config(env, mode)
    forbidden = [
        key for key in env
        if key.startswith(("HG_ATLAS_", "HG_SESSION_", "HG_REFRESH_", "HG_CURSOR_"))
        or key == "HG_SSO_CLIENT_SECRET"
        or "MONGODB" in key
    ]
    if forbidden:
        raise ValueError("Cloud database and user SSO credentials are forbidden on the worker")
    return replace(
        base,
        cloud_api_origin=cloud.geturl().rstrip("/"),
        service_id=env["HG_WORKER_SERVICE_ID"],
        bearer_token=env["HG_WORKER_BEARER_TOKEN"],
    )
