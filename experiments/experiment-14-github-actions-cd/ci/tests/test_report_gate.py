"""Regression checks for cases that must never pass the publication gate."""
from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_tests import validate_report


class TestReportGate(unittest.TestCase):
    def verify(self, xml):
        with tempfile.TemporaryDirectory(prefix='focuslane-junit-') as directory:
            filename = Path(directory) / 'junit.xml'
            filename.write_text(xml)
            return validate_report(filename)

    def test_empty_and_skipped_only_are_rejected(self):
        for xml in ('<testsuites/>', '<testsuites><testsuite><testcase><skipped/></testcase></testsuite></testsuites>'):
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                self.verify(xml)

    def test_failure_or_error_is_rejected(self):
        for element in ('failure', 'error'):
            with self.subTest(element=element), self.assertRaises(ValueError):
                self.verify('<testsuite><testcase><' + element + '/></testcase></testsuite>')

    def test_malformed_or_non_junit_is_rejected(self):
        with self.assertRaises(ET.ParseError):
            self.verify('<testsuites>')
        with self.assertRaises(ValueError):
            self.verify('<page><testcase/></page>')

    def test_passing_and_partial_skips_are_counted(self):
        result = self.verify('<testsuites><testsuite><testcase/><testcase><skipped/></testcase></testsuite></testsuites>')
        self.assertEqual(result, {'tests': 2, 'executed': 1, 'failures': 0, 'skipped': 1})


if __name__ == '__main__':
    unittest.main()
