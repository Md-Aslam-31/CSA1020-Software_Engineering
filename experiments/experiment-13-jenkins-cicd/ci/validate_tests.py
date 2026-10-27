"""Require real, passing tests rather than accepting an empty JUnit artifact."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

root = ET.parse('reports/junit.xml').getroot()
cases = list(root.iter('testcase'))
failed = sum(case.find('failure') is not None or case.find('error') is not None for case in cases)
skipped = sum(case.find('skipped') is not None for case in cases)
executed = len(cases) - skipped
if executed < 1:
    raise SystemExit('Test gate rejected the run: no executable tests were recorded.')
if failed:
    raise SystemExit('Test gate rejected the run: failures or errors are present.')
Path('reports/test-summary.json').write_text(json.dumps({'tests': len(cases), 'executed': executed,
                                                      'failures': failed, 'skipped': skipped}, indent=2) + '\n')
print('Test gate verified ' + str(executed) + ' executed tests with no failures.')
