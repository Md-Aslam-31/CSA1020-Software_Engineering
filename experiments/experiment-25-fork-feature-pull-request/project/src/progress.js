/**
 * Summarize an ordered course without changing its lessons.
 * Durations are minutes and may be zero or fractional.
 */
export function calculateCourseProgress(lessons) {
  if (!Array.isArray(lessons)) {
    throw new TypeError('Lessons must be an array.');
  }

  const ids = new Set();
  let totalMinutes = 0;
  let remainingMinutes = 0;
  let completedLessons = 0;

  for (const lesson of lessons) {
    if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
      throw new TypeError('Each lesson must be an object.');
    }
    if (typeof lesson.id !== 'string' || lesson.id.trim() === '') {
      throw new TypeError('Each lesson needs a non-empty string ID.');
    }
    if (ids.has(lesson.id)) {
      throw new TypeError('Lesson IDs must be unique.');
    }
    ids.add(lesson.id);
    if (!Number.isFinite(lesson.durationMinutes) || lesson.durationMinutes < 0) {
      throw new TypeError('Lesson duration must be a finite, non-negative number.');
    }
    if (typeof lesson.completed !== 'boolean') {
      throw new TypeError('Lesson completion must be a boolean.');
    }

    totalMinutes += lesson.durationMinutes;
    if (lesson.completed) completedLessons += 1;
    else remainingMinutes += lesson.durationMinutes;
  }

  if (!Number.isFinite(totalMinutes)) {
    throw new RangeError('Combined lesson duration is too large.');
  }
  const totalLessons = lessons.length;
  const percentComplete = totalLessons === 0
    ? 0
    : Math.round((completedLessons / totalLessons) * 100);
  const status = totalLessons > 0 && completedLessons === totalLessons
    ? 'complete'
    : completedLessons > 0 ? 'in-progress' : 'not-started';

  return { totalLessons, completedLessons, percentComplete, remainingMinutes, totalMinutes, status };
}
