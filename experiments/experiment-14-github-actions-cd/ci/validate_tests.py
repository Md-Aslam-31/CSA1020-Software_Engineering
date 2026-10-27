"""Make a nonempty, executed, passing JUnit report a publication requirement."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET


def validate_report(filename):
    root = ET.parse(filename).getroot()
    if root.tag not in ('testsuite', 'testsuites'):
        raise ValueError('JUnit root must be testsuite or testsuites.')
    cases = list(root.iter('testcase'))
    failures = sum(case.find('failure') is not None or case.find('error') is not None for case in cases)
    skipped = sum(case.find('skipped') is not None for case in cases)
    executed = len(cases) - skipped
    if executed < 1:
        raise ValueError('No executed tests were recorded.')
    if failures:
        raise ValueError('The test report contains failures or errors.')
    return {'tests': len(cases), 'executed': executed, 'failures': failures, 'skipped': skipped}


def main():
    try:
        result = validate_report('reports/junit.xml')
    except (OSError, ET.ParseError, ValueError) as error:
        raise SystemExit('Test gate rejected this run: ' + str(error)) from None
    Path('reports').mkdir(exist_ok=True)
    Path('reports/test-summary.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Verified ' + str(result['executed']) + ' executed tests with no failures.')


if __name__ == '__main__':
    main()
