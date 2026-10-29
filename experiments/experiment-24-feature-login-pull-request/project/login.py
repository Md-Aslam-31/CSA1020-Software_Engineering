"""A small login function using caller-supplied, salted password hashes."""

from collections.abc import Mapping
from hashlib import pbkdf2_hmac
from hmac import compare_digest


def login(username: str, password: str, users: Mapping) -> bool:
    """Return whether credentials match a stored user record.

    Each record is ``(salt_bytes, password_hash_bytes)``. Create its hash with
    ``pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)`` and a
    unique random salt of at least 16 bytes. No real credentials are included.
    """
    if not isinstance(username, str) or not isinstance(password, str):
        return False
    if not username or not password or not isinstance(users, Mapping):
        return False

    record = users.get(username)
    if not isinstance(record, tuple) or len(record) != 2:
        return False
    salt, expected_hash = record
    if not isinstance(salt, bytes) or len(salt) < 16:
        return False
    if not isinstance(expected_hash, bytes) or len(expected_hash) != 32:
        return False

    candidate = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)
    return compare_digest(candidate, expected_hash)
