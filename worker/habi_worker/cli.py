import argparse
import json
import os
import sys

from habi_worker.config import load_config
from habi_worker.host_lock import HostLockBusy, acquire_host_lock
from habi_worker.local_runtime import WorkerDependencyError, run_local_smoke, verify_local_runtime


def main():
    parser = argparse.ArgumentParser(prog="habi-worker")
    parser.add_argument("command", choices=("verify-local", "smoke-local"))
    args = parser.parse_args()
    try:
        config = load_config(os.environ)
        if config.mode != "local_synthetic":
            raise ValueError("This command requires HG_WORKER_MODE=local_synthetic")
        with acquire_host_lock(config.host_lock_path):
            result = verify_local_runtime(config) if args.command == "verify-local" else run_local_smoke(config)
        print(json.dumps({"ok": True, **result}, separators=(",", ":")))
        return 0
    except HostLockBusy:
        print(json.dumps({"ok": False, "error": "HOST_LOCK_BUSY"}), file=sys.stderr)
        return 3
    except (ValueError, WorkerDependencyError) as error:
        code = str(error) or "WORKER_CONFIGURATION_INVALID"
        print(json.dumps({"ok": False, "error": code}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
