from dataclasses import dataclass, field
import re
from urllib.parse import urlparse


@dataclass(frozen=True)
class WorkerConfig:
    cloud_api_origin: str
    client_id: str
    client_secret: str = field(repr=False)
    token_endpoint: str
    host_lock_path: str
    ollama_origin: str
    model: str
    model_digest: str
    prompt_hash: str


def load_config(env):
    required = (
        "HG_CLOUD_API_ORIGIN",
        "HG_WORKER_CLIENT_ID",
        "HG_WORKER_CLIENT_SECRET",
        "HG_WORKER_SSO_TOKEN_ENDPOINT",
        "HG_HOST_LOCK_PATH",
        "HG_OLLAMA_ORIGIN",
        "HG_MODEL",
        "HG_MODEL_DIGEST",
        "HG_PROMPT_HASH",
    )
    missing = [key for key in required if not env.get(key, "").strip()]
    if missing:
        raise ValueError("Missing worker configuration: " + ", ".join(missing))

    for key in ("HG_CLOUD_API_ORIGIN", "HG_WORKER_SSO_TOKEN_ENDPOINT", "HG_OLLAMA_ORIGIN"):
        parsed = urlparse(env[key])
        if parsed.scheme not in ("https", "http") or not parsed.netloc:
            raise ValueError(key + " must be an absolute HTTP(S) URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(key + " must not contain credentials, query, or fragment")
        if key == "HG_WORKER_SSO_TOKEN_ENDPOINT" and parsed.scheme != "https":
            raise ValueError(key + " must use HTTPS")

    cloud = urlparse(env["HG_CLOUD_API_ORIGIN"])
    if cloud.scheme != "https":
        raise ValueError("HG_CLOUD_API_ORIGIN must use HTTPS")

    ollama = urlparse(env["HG_OLLAMA_ORIGIN"])
    if ollama.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("HG_OLLAMA_ORIGIN must point to the local model host")

    if not re.fullmatch(r"sha256:[0-9a-f]{64}", env["HG_MODEL_DIGEST"]):
        raise ValueError("HG_MODEL_DIGEST must be a verified sha256 runtime manifest digest")
    if not re.fullmatch(r"[0-9a-f]{64}", env["HG_PROMPT_HASH"]):
        raise ValueError("HG_PROMPT_HASH must be a lowercase SHA-256 digest")
    forbidden = [
        key for key in env
        if key.startswith(("HG_ATLAS_", "HG_SESSION_", "HG_REFRESH_", "HG_CURSOR_"))
        or key == "HG_SSO_CLIENT_SECRET"
        or "MONGODB" in key
    ]
    if forbidden:
        raise ValueError("Cloud database and user SSO credentials are forbidden on the worker")

    return WorkerConfig(
        cloud_api_origin=cloud.geturl().rstrip("/"),
        client_id=env["HG_WORKER_CLIENT_ID"],
        client_secret=env["HG_WORKER_CLIENT_SECRET"],
        token_endpoint=env["HG_WORKER_SSO_TOKEN_ENDPOINT"],
        host_lock_path=env["HG_HOST_LOCK_PATH"],
        ollama_origin=ollama.geturl().rstrip("/"),
        model=env["HG_MODEL"],
        model_digest=env["HG_MODEL_DIGEST"],
        prompt_hash=env["HG_PROMPT_HASH"],
    )
