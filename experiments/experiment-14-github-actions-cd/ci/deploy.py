"""Deploy only the pushed, tested FocusLane digest and verify its cloud behavior."""
import json
import os
from pathlib import Path
import re
import time
from urllib import parse, request
from urllib.error import HTTPError, URLError

from contract import sample_plan, verify_plan


def read_json(url, body=None):
    headers = {'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = request.Request(url, headers=headers, data=None if body is None else json.dumps(body).encode(),
                          method='GET' if body is None else 'POST')
    with request.urlopen(req, timeout=20) as response:
        return response.status, json.load(response)


def load_image():
    repository = os.environ['IMAGE_REPOSITORY'].removeprefix('docker.io/')
    if repository != 'coastrider7/csa1020-exp14-focuslane':
        raise RuntimeError('Unexpected image repository; deployment is blocked.')
    values = json.loads(Path('reports/image-digests.json').read_text())
    if not isinstance(values, list):
        raise RuntimeError('Registry digest receipt must be an array.')
    for value in values:
        if isinstance(value, str):
            normalized = value.removeprefix('docker.io/')
            if re.fullmatch(re.escape(repository) + r'@sha256:[a-f0-9]{64}', normalized):
                return normalized
    raise RuntimeError('No pushed digest matches the tested FocusLane repository.')


def main():
    hook = os.environ['RENDER_DEPLOY_HOOK']
    service = os.environ['RENDER_SERVICE_ID']
    parts = parse.urlsplit(hook)
    query = parse.parse_qsl(parts.query, keep_blank_values=True)
    if (not re.fullmatch(r'srv-[a-z0-9]+', service) or parts.scheme != 'https' or
            parts.hostname != 'api.render.com' or parts.username or parts.password or parts.port or
            parts.fragment or parts.path != '/deploy/' + service or
            len([value for key, value in query if key == 'key' and value]) != 1):
        raise RuntimeError('Deploy credential does not match the configured Render service.')
    base = os.environ['CLOUD_URL'].rstrip('/')
    cloud_parts = parse.urlsplit(base)
    if (cloud_parts.scheme != 'https' or cloud_parts.hostname != 'focuslane-exp14.onrender.com' or
            cloud_parts.username or cloud_parts.password or cloud_parts.port or
            cloud_parts.path or cloud_parts.query or cloud_parts.fragment):
        raise RuntimeError('Unexpected cloud destination; deployment is blocked.')
    image = load_image()
    query = [(key, value) for key, value in query if key not in ('imgURL', 'ref')]
    query.append(('imgURL', 'docker.io/' + image))
    target = parse.urlunsplit((parts.scheme, parts.netloc, parts.path, parse.urlencode(query), ''))
    try:
        with request.urlopen(request.Request(target, method='POST', data=b''), timeout=35) as response:
            accepted_status = response.status
            body = response.read()
            accepted = json.loads(body) if body else {}
    except HTTPError as error:
        raise RuntimeError('Render rejected the deployment request with HTTP ' + str(error.code)) from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise RuntimeError('Render did not return a valid deployment acknowledgement.') from None
    if accepted_status not in (200, 202) or not isinstance(accepted, dict):
        raise RuntimeError('Render returned an unsupported deployment acknowledgement.')
    deploy = accepted.get('deploy', {})
    deploy_id = deploy.get('id') if isinstance(deploy, dict) else None
    deploy_id = deploy_id or accepted.get('id')
    print('Render accepted the tested image digest. Waiting for the matching public application.')
    expected_sha = os.environ['SOURCE_SHA']
    expected_build = os.environ['BUILD_NUMBER']
    deadline = time.monotonic() + 720
    version = None
    while time.monotonic() < deadline:
        try:
            status, candidate = read_json(base + '/api/version')
            data = candidate.get('data', {})
            if (status == 200 and data.get('application') == 'FocusLane' and
                    data.get('gitSha') == expected_sha and str(data.get('buildNumber')) == expected_build):
                version = candidate
                break
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, AttributeError):
            pass
        time.sleep(10)
    if version is None:
        raise RuntimeError('Cloud did not serve the expected commit and run number within 12 minutes.')
    try:
        health_status, health = read_json(base + '/healthz')
        if health_status != 200 or not isinstance(health, dict) or health.get('status') != 'healthy':
            raise RuntimeError('The new cloud release failed its health check.')
        plan_status, plan = read_json(base + '/api/plan', sample_plan())
        if plan_status != 200:
            raise RuntimeError('The new cloud release rejected the example study plan.')
        plan_verification = verify_plan(plan)
        invalid_body = sample_plan()
        invalid_body['dailyMinutes'] = 0
        try:
            read_json(base + '/api/plan', invalid_body)
        except HTTPError as error:
            if error.code != 400:
                raise RuntimeError('Cloud invalid-input handling did not return HTTP 400.') from None
        else:
            raise RuntimeError('Cloud incorrectly accepted an invalid study plan.')
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, AssertionError, TypeError):
        raise RuntimeError('Cloud HTTP contract verification failed for the new release.') from None
    report = {'cloud': 'Render', 'url': base, 'serviceId': service, 'deployId': deploy_id,
              'acceptedHttpStatus': accepted_status, 'image': image, 'sourceSha': expected_sha,
              'buildNumber': expected_build, 'githubRunId': os.environ.get('GITHUB_RUN_ID'),
              'verifiedVersion': version, 'healthHttpStatus': health_status, 'planHttpStatus': plan_status,
              'invalidInputHttpStatus': 400, 'planVerification': plan_verification}
    Path('reports').mkdir(exist_ok=True)
    Path('reports/cloud-deployment.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Verified cloud health, scheduling, validation, commit ' + expected_sha[:12] + ' and run ' + expected_build + '.')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    except (KeyError, OSError, ValueError, TypeError, AttributeError, AssertionError):
        raise SystemExit('Deployment configuration or verification data is invalid; no secret values are displayed.') from None
