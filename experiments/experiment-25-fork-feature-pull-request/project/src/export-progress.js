import { calculateCourseProgress } from './progress.js';

/**
 * Export a course summary and its supported lesson fields as readable JSON.
 * Example: const json = exportCourseProgress([{ id: 'intro', durationMinutes: 10, completed: true }]);
 * Invalid lessons use the same validation rules as calculateCourseProgress.
 */
export function exportCourseProgress(lessons) {
  const summary = calculateCourseProgress(lessons);
  const exportedLessons = lessons.map(({ id, durationMinutes, completed }) => ({
    id, durationMinutes, completed
  }));

  return JSON.stringify({ summary, lessons: exportedLessons }, null, 2) + '\n';
}
