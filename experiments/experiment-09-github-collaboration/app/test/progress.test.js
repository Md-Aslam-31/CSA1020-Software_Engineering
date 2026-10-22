import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCourseProgress } from '../src/progress.js';

const lesson = (id, durationMinutes, completed = false) => ({ id, durationMinutes, completed });

test('an empty course has no completed lessons or remaining duration', () => {
  assert.deepEqual(calculateCourseProgress([]), {
    totalLessons: 0, completedLessons: 0, percentComplete: 0,
    remainingMinutes: 0, totalMinutes: 0, status: 'not-started'
  });
});

test('a new course reports the full duration remaining', () => {
  const progress = calculateCourseProgress([lesson('intro', 10), lesson('branch', 20)]);
  assert.equal(progress.percentComplete, 0);
  assert.equal(progress.remainingMinutes, 30);
  assert.equal(progress.status, 'not-started');
});

test('partial progress counts completed lessons and only unfinished minutes', () => {
  assert.deepEqual(calculateCourseProgress([
    lesson('fork', 10, true), lesson('branch', 20), lesson('commit', 15, true)
  ]), {
    totalLessons: 3, completedLessons: 2, percentComplete: 67,
    remainingMinutes: 20, totalMinutes: 45, status: 'in-progress'
  });
});

test('finishing the last lesson reaches 100 percent and zero remaining minutes', () => {
  const progress = calculateCourseProgress([lesson('intro', 10, true), lesson('review', 20, true)]);
  assert.equal(progress.percentComplete, 100);
  assert.equal(progress.remainingMinutes, 0);
  assert.equal(progress.status, 'complete');
});

test('calculating progress does not modify the course or its lessons', () => {
  const course = Object.freeze([Object.freeze(lesson('intro', 10, true))]);
  assert.equal(calculateCourseProgress(course).completedLessons, 1);
  assert.deepEqual(course, [lesson('intro', 10, true)]);
});

test('rejects a non-array course', () => {
  assert.throws(() => calculateCourseProgress(null), /must be an array/);
});

test('rejects duplicate IDs and missing records', () => {
  assert.throws(() => calculateCourseProgress([lesson('same', 10), lesson('same', 20)]), /unique/);
  assert.throws(() => calculateCourseProgress([null]), /must be an object/);
});

test('rejects negative durations and non-boolean completion', () => {
  assert.throws(() => calculateCourseProgress([lesson('bad', -1)]), /non-negative/);
  assert.throws(() => calculateCourseProgress([lesson('bad', 10, 'yes')]), /boolean/);
});

test('zero-duration lessons still count toward completion', () => {
  const progress = calculateCourseProgress([lesson('welcome', 0, true), lesson('practice', 0)]);
  assert.equal(progress.percentComplete, 50);
  assert.equal(progress.totalMinutes, 0);
  assert.equal(progress.remainingMinutes, 0);
  assert.equal(progress.status, 'in-progress');
});

test('fractional minutes stay precise and do not weight lesson completion', () => {
  const progress = calculateCourseProgress([lesson('intro', 0.25, true), lesson('practice', 1.5)]);
  assert.equal(progress.percentComplete, 50);
  assert.equal(progress.totalMinutes, 1.75);
  assert.equal(progress.remainingMinutes, 1.5);
});

test('rejects non-finite durations and numeric strings', () => {
  for (const duration of [NaN, Infinity, -Infinity, '10']) {
    assert.throws(() => calculateCourseProgress([lesson('invalid', duration)]), /finite/);
  }
});

test('rejects total duration overflow even when each duration is finite', () => {
  assert.throws(() => calculateCourseProgress([
    lesson('first', Number.MAX_VALUE), lesson('second', Number.MAX_VALUE)
  ]), RangeError);
});

test('rejects blank identifiers and sparse course arrays', () => {
  assert.throws(() => calculateCourseProgress([lesson(' ', 10)]), /non-empty/);
  assert.throws(() => calculateCourseProgress(new Array(1)), /object/);
});
