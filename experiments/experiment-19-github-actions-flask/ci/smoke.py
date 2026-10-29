"""Run the exact publishable image in an isolated container and check its API."""
import json
import os
from pathlib import Path
import re
import subprocess


def docker(*args, check=True, input=None):
    return subprocess.run(["docker", *args], capture_output=True, text=True,
                          check=check, input=input, timeout=90)


def main():
    image = os.environ["RELEASE_IMAGE"]
    suffix = re.sub(r"[^a-zA-Z0-9_.-]", "-", os.environ.get("GITHUB_RUN_ID", os.environ["BUILD_NUMBER"]))
    name = "packlight-exp19-smoke-" + suffix
    verifier = Path("ci/verify-deployment.py").read_text(encoding="utf-8")
    created = False
    try:
        docker("run", "-d", "--name", name, "--network", "none", "--read-only",
               "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", "--cap-drop", "ALL",
               "--security-opt", "no-new-privileges=true", "--memory", "256m", image)
        created = True
        result = docker("exec", "-i", name, "python", "-", "--base", "http://127.0.0.1:8000",
                        "--sha", os.environ["SOURCE_SHA"], "--build", os.environ["BUILD_NUMBER"],
                        "--wait-seconds", "30", input=verifier)
        report = json.loads(result.stdout)
        assert report["passed"]
        Path("reports").mkdir(exist_ok=True)
        Path("reports/container-smoke.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print("The exact runtime image passed health, build identity, packing and invalid-input checks.")
    finally:
        if created:
            docker("rm", "-f", name, check=False)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, AssertionError, subprocess.SubprocessError):
        raise SystemExit("Runtime container verification failed; image publication is blocked.") from None
