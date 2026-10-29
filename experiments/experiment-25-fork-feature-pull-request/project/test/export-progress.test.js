import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCourseProgress } from '../src/export-progress.js';

test('exports readable JSON with fractional durations and ordered lessons', () => {
  const lessons = [
    { id: 'intro', durationMinutes: 0.25, completed: true },
    { id: 'practice', durationMinutes: 1.5, completed: false }
  ];
  const json = exportCourseProgress(lessons);

  assert.deepEqual(JSON.parse(json), {
    summary: {
      totalLessons: 2, completedLessons: 1, percentComplete: 50,
      remainingMinutes: 1.5, totalMinutes: 1.75, status: 'in-progress'
    },
    lessons
  });
  assert.ok(json.startsWith('{\n  "summary": {\n'));
  assert.ok(json.endsWith('\n'));
});

test('exports an empty course as a zero summary and empty lesson list', () => {
  assert.deepEqual(JSON.parse(exportCourseProgress([])), {
    summary: {
      totalLessons: 0, completedLessons: 0, percentComplete: 0,
      remainingMinutes: 0, totalMinutes: 0, status: 'not-started'
    },
    lessons: []
  });
});

test('retains completed status and zero-duration lesson values', () => {
  const result = JSON.parse(exportCourseProgress([
    { id: 'done', durationMinutes: 0, completed: true }
  ]));
  assert.equal(result.summary.status, 'complete');
  assert.equal(result.summary.percentComplete, 100);
  assert.deepEqual(result.lessons, [{ id: 'done', durationMinutes: 0, completed: true }]);
});

test('accepts frozen input without changing the course or its lessons', () => {
  const entry = Object.freeze({ id: 'read-only', durationMinutes: 5, completed: false });
  const lessons = Object.freeze([entry]);
  const before = JSON.stringify(lessons);

  assert.doesNotThrow(() => exportCourseProgress(lessons));
  assert.equal(JSON.stringify(lessons), before);
  assert.equal(lessons[0], entry);
});

test('exports only supported lesson fields and omits unrelated metadata', () => {
  const result = JSON.parse(exportCourseProgress([
    { id: 'notes', durationMinutes: 10, completed: false, privateNotes: 'not part of the export' }
  ]));
  assert.deepEqual(result.lessons, [{ id: 'notes', durationMinutes: 10, completed: false }]);
  assert.deepEqual(Object.keys(result), ['summary', 'lessons']);
});

test('rejects invalid courses through the shared progress validation', () => {
  assert.throws(() => exportCourseProgress(null), TypeError);
  assert.throws(() => exportCourseProgress([
    { id: 'invalid', durationMinutes: Infinity, completed: false }
  ]), TypeError);
  assert.throws(() => exportCourseProgress([
    { id: 'duplicate', durationMinutes: 1, completed: false },
    { id: 'duplicate', durationMinutes: 2, completed: true }
  ]), TypeError);
});
