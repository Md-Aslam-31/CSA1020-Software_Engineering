"""Verify Packlight's real HTTP behavior and expected image build identity."""
import argparse
import json
import os
from pathlib import Path
import time
from urllib import parse, request
from urllib.error import HTTPError, URLError


SAMPLE = {"days": 4, "travelers": 2, "climate": "rainy", "activity": "trail", "laundry": False}


def read_json(base, path, payload=None):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = request.Request(base + path, headers=headers,
                          data=None if payload is None else json.dumps(payload).encode(),
                          method="GET" if payload is None else "POST")
    with request.urlopen(req, timeout=12) as response:
        return response.status, json.load(response)


def verify(base, source_sha, build_number, wait_seconds):
    parts = parse.urlsplit(base)
    loopback = parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost")
    if (not (parts.scheme == "https" or loopback) or not parts.hostname or
            parts.username or parts.password or parts.query or parts.fragment or parts.path):
        raise RuntimeError("Invalid verification destination")
    deadline = time.monotonic() + wait_seconds
    version = None
    while True:
        try:
            status, candidate = read_json(base, "/api/version")
            if (status == 200 and candidate.get("application") == "Packlight" and
                    candidate.get("git_sha") == source_sha and
                    str(candidate.get("build_number")) == str(build_number)):
                version = candidate
                break
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, AttributeError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError("Application did not serve the expected commit and build")
        time.sleep(min(5, max(0, deadline - time.monotonic())))

    health_status, health = read_json(base, "/healthz")
    assert health_status == 200 and health.get("status") == "ok"
    status, packing = read_json(base, "/api/packing-list", SAMPLE)
    assert status == 200 and packing["trip"] == SAMPLE
    categories = packing["categories"]
    assert len(categories) == 4
    items = {item["name"]: item["quantity"] for group in categories for item in group["items"]}
    assert all(type(quantity) is int and quantity > 0 for quantity in items.values())
    expected = {"Tops": 8, "Underwear": 10, "Socks": 8, "Bottoms": 4,
                "Rain jacket": 2, "Waterproof bag": 2, "Trail shoes": 2,
                "Headlamp": 2, "First aid kit": 1}
    assert all(items.get(name) == quantity for name, quantity in expected.items())
    assert packing["total_items"] == sum(items.values()) == 47
    invalid = {**SAMPLE, "days": 0}
    try:
        read_json(base, "/api/packing-list", invalid)
    except HTTPError as error:
        assert error.code == 400
    else:
        raise AssertionError("Invalid input was accepted")
    with request.urlopen(base + "/", timeout=12) as response:
        assert response.status == 200 and b"Packlight" in response.read()
    return {"application_url": base, "version": version, "health_http_status": 200,
            "packing_http_status": 200, "invalid_input_http_status": 400,
            "example_trip": SAMPLE, "example_total_items": packing["total_items"],
            "expected_item_quantities_verified": expected, "passed": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=os.environ.get("CLOUD_URL"))
    parser.add_argument("--sha", default=os.environ.get("SOURCE_SHA"))
    parser.add_argument("--build", default=os.environ.get("BUILD_NUMBER"))
    parser.add_argument("--wait-seconds", type=int, default=720)
    parser.add_argument("--output")
    args = parser.parse_args()
    assert args.base and args.sha and args.build and 0 <= args.wait_seconds <= 900
    report = verify(args.base.rstrip("/"), args.sha, args.build, args.wait_seconds)
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, AssertionError):
        raise SystemExit("HTTP verification failed; application behavior or build identity did not match.") from None
