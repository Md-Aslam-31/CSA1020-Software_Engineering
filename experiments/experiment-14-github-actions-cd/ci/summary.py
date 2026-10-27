"""Write a small, secret-free delivery receipt and Actions step summary."""
import json
import os
from pathlib import Path


def load(name):
    filename = Path('reports') / name
    if not filename.is_file():
        return None
    try:
        return json.loads(filename.read_text())
    except (OSError, ValueError):
        return None


def main():
    reports = Path('reports')
    reports.mkdir(exist_ok=True)
    tests = load('test-summary.json')
    smoke = load('container-smoke.json')
    digests = load('image-digests.json')
    cloud = load('cloud-deployment.json')
    receipt = {'application': 'FocusLane', 'sourceSha': os.environ.get('SOURCE_SHA'),
               'buildNumber': os.environ.get('BUILD_NUMBER'), 'githubRunId': os.environ.get('GITHUB_RUN_ID'),
               'githubRunAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
               'event': os.environ.get('GITHUB_EVENT_NAME'), 'ref': os.environ.get('GITHUB_REF'),
               'jobStatus': os.environ.get('JOB_STATUS', 'unknown'),
               'tests': tests, 'containerVerification': smoke, 'publishedDigests': digests,
               'cloudDeployment': cloud,
               'deploymentVerified': bool(cloud and cloud.get('healthHttpStatus') == 200 and
                                          cloud.get('sourceSha') == os.environ.get('SOURCE_SHA') and
                                          str(cloud.get('buildNumber')) == os.environ.get('BUILD_NUMBER'))}
    (reports / 'delivery-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    lines = ['# FocusLane continuous delivery', '',
             '| Checkpoint | Recorded result |', '|---|---|',
             '| Commit | `' + str(receipt['sourceSha']) + '` |',
             '| GitHub run | ' + str(receipt['buildNumber']) + ' |',
             '| Event | ' + str(receipt['event']) + ' |',
             '| Job result at summary step | ' + str(receipt['jobStatus']) + ' |',
             '| Executed application tests | ' + (str(tests['executed']) + ' with zero failures' if tests else 'No passing test receipt') + ' |',
             '| Runtime HTTP checks | ' + ('Verified' if smoke else 'Not recorded') + ' |',
             '| Registry publication | ' + ('Digest recorded' if digests else 'Not performed or not completed') + ' |',
             '| Cloud deployment | ' + ('Verified exact commit and run' if receipt['deploymentVerified'] else 'Not performed or not completed') + ' |', '']
    if receipt['deploymentVerified']:
        lines += ['Cloud app: ' + cloud['url'], '', 'Tested image: `' + cloud['image'] + '`', '']
    else:
        lines += ['Pull requests validate without deployment secrets. Initial bootstrap runs may publish an image before the cloud target is enabled.', '']
    summary_file = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_file:
        with open(summary_file, 'a', encoding='utf-8') as output:
            output.write('\n'.join(lines))
    print('Saved the delivery receipt; no deployment is claimed without matching cloud verification.')


if __name__ == '__main__':
    main()
