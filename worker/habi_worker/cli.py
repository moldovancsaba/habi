import argparse
import json
import os
import sys

from habi_worker.config import load_config
from habi_worker.host_lock import HostLockBusy, acquire_host_lock
from habi_worker.local_runtime import WorkerDependencyError, run_local_smoke, verify_local_runtime
from habi_worker.service_runtime import WorkerApiError, run_service


def main():
    parser = argparse.ArgumentParser(prog="habi-worker")
    parser.add_argument("command", choices=("verify-local", "smoke-local", "run-service"))
    args = parser.parse_args()
    try:
        config = load_config(os.environ)
        if args.command == "run-service" and config.mode not in ("hosted", "local_test"):
            raise ValueError("run-service requires hosted or local_test mode")
        with acquire_host_lock(config.host_lock_path):
            if args.command == "run-service":
                run_service(config)
                result = {"service": "stopped"}
            elif args.command == "verify-local":
                result = verify_local_runtime(config)
            else:
                result = run_local_smoke(config)
        print(json.dumps({"ok": True, **result}, separators=(",", ":")))
        return 0
    except HostLockBusy:
        print(json.dumps({"ok": False, "error": "HOST_LOCK_BUSY"}), file=sys.stderr)
        return 3
    except (ValueError, WorkerDependencyError, WorkerApiError) as error:
        code = str(error) or "WORKER_CONFIGURATION_INVALID"
        print(json.dumps({"ok": False, "error": code}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
