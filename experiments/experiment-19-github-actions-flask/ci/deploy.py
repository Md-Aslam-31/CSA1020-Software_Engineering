"""Send only the tested image digest to the configured Render service."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib import parse, request
from urllib.error import HTTPError, URLError


def main():
    repository = os.environ["IMAGE_REPOSITORY"]
    assert repository == "coastrider7/csa1020-exp19-packlight"
    digests = json.loads(Path("reports/image-digests.json").read_text(encoding="utf-8"))
    assert isinstance(digests, list)
    images = [value.removeprefix("docker.io/") for value in digests if isinstance(value, str)]
    image = next((value for value in images if re.fullmatch(re.escape(repository) + r"@sha256:[a-f0-9]{64}", value)), None)
    assert image, "Published image digest missing"
    service = os.environ["RENDER_SERVICE_ID"]
    hook = parse.urlsplit(os.environ["RENDER_DEPLOY_HOOK"])
    query = parse.parse_qsl(hook.query, keep_blank_values=True)
    assert re.fullmatch(r"srv-[a-z0-9]+", service)
    assert (hook.scheme == "https" and hook.hostname == "api.render.com" and
            not hook.username and not hook.password and not hook.port and not hook.fragment and
            hook.path == "/deploy/" + service and len(query) == 1 and query[0][0] == "key" and query[0][1])
    base = os.environ["CLOUD_URL"].rstrip("/")
    cloud = parse.urlsplit(base)
    assert (cloud.scheme == "https" and cloud.hostname and cloud.hostname.endswith(".onrender.com") and
            not cloud.username and not cloud.password and not cloud.port and not cloud.path and
            not cloud.query and not cloud.fragment)
    target = parse.urlunsplit((hook.scheme, hook.netloc, hook.path,
                             parse.urlencode(query + [("imgURL", "docker.io/" + image)]), ""))
    try:
        with request.urlopen(request.Request(target, data=b"", method="POST"), timeout=35) as response:
            accepted_status = response.status
            body = response.read()
            accepted = json.loads(body) if body else {}
    except HTTPError as error:
        raise RuntimeError("Render rejected deployment with HTTP " + str(error.code)) from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise RuntimeError("Render did not acknowledge the deployment request") from None
    assert accepted_status in (200, 202) and isinstance(accepted, dict)
    deploy = accepted.get("deploy", {})
    deploy_id = deploy.get("id") if isinstance(deploy, dict) else None
    deploy_id = deploy_id or accepted.get("id")
    print("Render accepted the tested image digest; waiting for its matching live application.")
    subprocess.run([sys.executable, "ci/verify-deployment.py", "--base", base,
                    "--sha", os.environ["SOURCE_SHA"], "--build", os.environ["BUILD_NUMBER"],
                    "--wait-seconds", "720", "--output", "reports/cloud-verification.json"], check=True)
    verification = json.loads(Path("reports/cloud-verification.json").read_text(encoding="utf-8"))
    receipt = {"platform": "Render", "service_id": service, "deploy_id": deploy_id,
               "accepted_http_status": accepted_status, "image": image,
               "source_sha": os.environ["SOURCE_SHA"], "build_number": os.environ["BUILD_NUMBER"],
               "github_run_id": os.environ.get("GITHUB_RUN_ID"), "application_url": base,
               "verification": verification}
    Path("reports/cloud-deployment.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("Verified the deployed Flask API and the exact expected source commit/build.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    except (OSError, ValueError, KeyError, TypeError, AssertionError, subprocess.SubprocessError):
        raise SystemExit("Deployment configuration or verification failed; credentials are not displayed.") from None
