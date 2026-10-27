"""Trigger the exact tested image through a Jenkins secret, then verify the public release."""
import json
import os
from pathlib import Path
import time
from urllib import parse, request
from urllib.error import HTTPError, URLError


def main():
    hook = os.environ['RENDER_DEPLOY_HOOK']
    parts = parse.urlsplit(hook)
    if parts.scheme != 'https' or parts.hostname != 'api.render.com' or not parts.path.startswith('/deploy/srv-'):
        raise RuntimeError('Deploy hook must be a Render HTTPS deploy hook.')
    digests = json.loads(Path('reports/image-digests.json').read_text())
    prefix = os.environ['IMAGE_REPOSITORY'] + '@sha256:'
    image = next((value for value in digests if value.startswith(prefix)), None)
    if not image:
        raise RuntimeError('No pushed digest found for the tested image repository.')
    query = parse.parse_qsl(parts.query, keep_blank_values=True)
    query = [(key, value) for key, value in query if key != 'imgURL']
    query.append(('imgURL', 'docker.io/' + image))
    target = parse.urlunsplit((parts.scheme, parts.netloc, parts.path, parse.urlencode(query), ''))
    try:
        with request.urlopen(request.Request(target, method='POST', data=b''), timeout=35) as response:
            status = response.status
            result = json.load(response)
    except HTTPError as exc:
        raise RuntimeError('Render rejected the deploy request with HTTP ' + str(exc.code)) from None
    except URLError:
        raise RuntimeError('Render deploy request could not be reached.') from None
    deploy_id = result.get('deploy', {}).get('id') or result.get('id')
    print('Render accepted the tested image. Waiting for the public release to match this build.')
    base = os.environ['CLOUD_URL'].rstrip('/')
    if parse.urlsplit(base).scheme != 'https' or not parse.urlsplit(base).hostname.endswith('.onrender.com'):
        raise RuntimeError('Expected an HTTPS Render service URL.')
    expected_sha = os.environ['SOURCE_SHA']
    expected_build = os.environ['BUILD_NUMBER']
    deadline = time.monotonic() + 720
    while time.monotonic() < deadline:
        try:
            with request.urlopen(base + '/api/version', timeout=15) as response:
                version = json.load(response)
            data = version.get('data', version)
            if str(data.get('gitSha', data.get('git_sha', ''))) == expected_sha and str(data.get('buildNumber', data.get('build_number', ''))) == expected_build:
                with request.urlopen(base + '/healthz', timeout=15) as response:
                    if response.status != 200:
                        raise ValueError('Health check did not pass')
                report = {'cloud': 'Render', 'url': base, 'deployId': deploy_id, 'acceptedHttpStatus': status,
                          'image': image, 'sourceSha': expected_sha, 'buildNumber': expected_build,
                          'verifiedVersion': version, 'healthHttpStatus': 200}
                Path('reports/cloud-deployment.json').write_text(json.dumps(report, indent=2) + '\n')
                print('Verified cloud health and exact source/build identity: ' + expected_sha[:12] + ' / ' + expected_build)
                return
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError):
            pass
        time.sleep(10)
    raise RuntimeError('Cloud did not serve the expected source SHA and build number within 12 minutes.')


if __name__ == '__main__':
    main()
