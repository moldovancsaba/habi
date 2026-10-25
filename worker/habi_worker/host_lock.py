from contextlib import contextmanager
import fcntl
import os


class HostLockBusy(RuntimeError):
    pass


@contextmanager
def acquire_host_lock(path):
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise HostLockBusy("HOST_LOCK_BUSY") from error
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)
