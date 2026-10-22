import { calculateCourseProgress } from '../src/progress.js';

const COURSE_ID = 'git-collaboration-v1';
const STORAGE_KEY = 'learnloop:course-progress:v1';
const LESSONS = [
  { id: 'fork', title: 'Fork & clone your starting point', detail: 'Make the project yours, locally and on GitHub', durationMinutes: 12 },
  { id: 'branch', title: 'Create a focused feature branch', detail: 'Keep one contribution clear and easy to review', durationMinutes: 18 },
  { id: 'build', title: 'Build, test & commit your change', detail: 'Turn your idea into a tested contribution', durationMinutes: 15 },
  { id: 'request', title: 'Push & open your pull request', detail: 'Explain the change and show your evidence', durationMinutes: 20 },
  { id: 'review', title: 'Review feedback & improve', detail: 'Respond with a follow-up commit', durationMinutes: 10 },
  { id: 'merge', title: 'Merge & reflect on the workflow', detail: 'Finish the contribution and sync your branch', durationMinutes: 15 },
];
const validIds = new Set(LESSONS.map((lesson) => lesson.id));
let completedIds = new Set();

const lessonList = document.querySelector('#lesson-list');
const percentComplete = document.querySelector('#percent-complete');
const completedCount = document.querySelector('#completed-count');
const totalCount = document.querySelector('#total-count');
const remainingMinutes = document.querySelector('#remaining-minutes');
const progressBar = document.querySelector('#course-progress');
const statusPill = document.querySelector('#course-status');
const progressCaption = document.querySelector('#progress-caption');
const saveStatus = document.querySelector('#save-status');
const lessonControls = new Map();
const progressLessonList = document.querySelector('#progress-lesson-list');
const progressLessonRows = new Map();
const nextLessonLink = document.querySelector('#next-lesson-link');
const ROUTES = {
  'learning-path': {
    panel: document.querySelector('#learning-path-view'),
    heading: document.querySelector('#course-title'),
    label: 'Learning path',
    title: 'From fork to finished.',
    description: 'Make progress you can see. Build skills you can use.',
  },
  'my-progress': {
    panel: document.querySelector('#my-progress-view'),
    heading: document.querySelector('#progress-detail-title'),
    label: 'My progress',
    title: 'Your progress, in focus.',
    description: 'See completed lessons, time left, and the next step to take.',
  },
  'workflow-guide': {
    panel: document.querySelector('#workflow-guide-view'),
    heading: document.querySelector('#workflow-guide-title'),
    label: 'Workflow guide',
    title: 'A guide for every step.',
    description: 'Practice the full Git workflow with clear instructions you can follow.',
  },
};
const ROUTE_ALIASES = {
  curriculum: 'learning-path',
  progress: 'my-progress',
  workflow: 'workflow-guide',
  top: 'learning-path',
};
let activeRoute = 'learning-path';

function setSaveStatus(message, warning = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle('is-warning', warning);
}

function loadProgress() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    setSaveStatus('Progress works for this visit. Your browser blocked access to saved progress.', true);
    return;
  }
  if (stored === null) {
    setSaveStatus('Your progress can be saved in this browser as you learn.');
    return;
  }
  try {
    const record = JSON.parse(stored);
    const ids = record?.completedLessonIds;
    if (
      record === null || typeof record !== 'object' || Array.isArray(record) ||
      record.version !== 1 || record.courseId !== COURSE_ID ||
      !Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && validIds.has(id)) ||
      new Set(ids).size !== ids.length
    ) {
      throw new TypeError('Unrecognized saved progress');
    }
    completedIds = new Set(ids);
    setSaveStatus('Restored your saved lesson progress from this browser.');
  } catch {
    completedIds = new Set();
    setSaveStatus('Saved progress could not be read. Your next change will save a fresh checklist.', true);
  }
}

function saveProgress(actionMessage) {
  const record = {
    version: 1,
    courseId: COURSE_ID,
    completedLessonIds: LESSONS.filter((lesson) => completedIds.has(lesson.id)).map((lesson) => lesson.id),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setSaveStatus(`${actionMessage} Saved in this browser.`);
  } catch {
    setSaveStatus(`${actionMessage} Progress is kept for this visit; your browser could not save it.`, true);
  }
}

function updateProgress() {
  const result = calculateCourseProgress(LESSONS.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    durationMinutes: lesson.durationMinutes,
    completed: completedIds.has(lesson.id),
  })));
  percentComplete.textContent = String(result.percentComplete);
  completedCount.textContent = String(result.completedLessons);
  totalCount.textContent = String(result.totalLessons);
  remainingMinutes.textContent = String(result.remainingMinutes);
  progressBar.value = result.percentComplete;
  progressBar.textContent = `${result.percentComplete}%`;
  const statuses = {
    'not-started': { label: 'Not started', caption: 'A fresh start. Your first step is ready.', className: '' },
    'in-progress': { label: 'In progress', caption: 'You’re building momentum. Keep going.', className: 'is-progress' },
    complete: { label: 'Complete', caption: 'Every lesson complete. Ready for your next contribution.', className: 'is-complete' },
  };
  const state = statuses[result.status];
  statusPill.textContent = state.label;
  statusPill.classList.remove('is-progress', 'is-complete');
  if (state.className) statusPill.classList.add(state.className);
  progressCaption.textContent = state.caption;
  for (const lesson of LESSONS) {
    const control = lessonControls.get(lesson.id);
    const completed = completedIds.has(lesson.id);
    control.input.checked = completed;
    control.row.classList.toggle('is-complete', completed);
    control.subtitle.textContent = completed ? 'Completed · nice work!' : lesson.detail;
    const progressRow = progressLessonRows.get(lesson.id);
    progressRow.row.classList.toggle('is-complete', completed);
    progressRow.status.textContent = completed ? 'Complete' : 'To do';
  }
  document.querySelector('#detail-completed-count').textContent = `${result.completedLessons} of ${result.totalLessons}`;
  document.querySelector('#studied-minutes').textContent = `${result.totalMinutes - result.remainingMinutes} min`;
  document.querySelector('#detail-percent-complete').textContent = `${result.percentComplete}%`;
  const nextLesson = LESSONS.find((lesson) => !completedIds.has(lesson.id));
  document.querySelector('#next-lesson-title').textContent = nextLesson ? nextLesson.title : 'Every lesson is complete!';
  document.querySelector('#next-lesson-description').textContent = nextLesson
    ? `${nextLesson.durationMinutes} minutes · ${nextLesson.detail}`
    : 'You have checked off all six lessons. Revisit any step or reset your checklist for another practice run.';
  nextLessonLink.textContent = nextLesson ? 'Continue learning ↗' : 'Review learning path ↗';
  if (nextLesson) nextLessonLink.dataset.focusLesson = nextLesson.id;
  else delete nextLessonLink.dataset.focusLesson;
}

function createLessonControls() {
  for (const [index, lesson] of LESSONS.entries()) {
    const row = document.createElement('label');
    row.className = 'lesson-row';
    row.htmlFor = `lesson-${lesson.id}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `lesson-${lesson.id}`;
    const number = document.createElement('span');
    number.className = 'lesson-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'lesson-copy';
    const title = document.createElement('span');
    title.className = 'lesson-title';
    title.id = `lesson-title-${lesson.id}`;
    title.textContent = lesson.title;
    input.setAttribute('aria-labelledby', title.id);
    const subtitle = document.createElement('span');
    subtitle.className = 'lesson-subtitle';
    subtitle.textContent = lesson.detail;
    const duration = document.createElement('span');
    duration.className = 'lesson-duration';
    duration.textContent = `${lesson.durationMinutes} min`;
    copy.append(title, subtitle);
    row.append(input, number, copy, duration);
    lessonList.append(row);
    lessonControls.set(lesson.id, { row, input, subtitle });
    input.addEventListener('change', () => {
      if (input.checked) completedIds.add(lesson.id);
      else completedIds.delete(lesson.id);
      updateProgress();
      saveProgress(`${lesson.title}: ${input.checked ? 'complete' : 'not complete'}.`);
    });
  }
}

function createProgressLessonRows() {
  for (const [index, lesson] of LESSONS.entries()) {
    const row = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'progress-lesson-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    const link = document.createElement('a');
    link.href = '#learning-path';
    link.dataset.route = 'learning-path';
    link.dataset.focusLesson = lesson.id;
    link.className = 'progress-lesson-link';
    const title = document.createElement('strong');
    title.textContent = lesson.title;
    const detail = document.createElement('span');
    detail.textContent = `${lesson.durationMinutes} min · Open this lesson`;
    link.append(title, detail);
    const status = document.createElement('span');
    status.className = 'lesson-state';
    status.textContent = 'To do';
    row.append(number, link, status);
    progressLessonList.append(row);
    progressLessonRows.set(lesson.id, { row, status });
  }
}

function routeFromHash() {
  const hash = window.location.hash.slice(1);
  if (Object.hasOwn(ROUTES, hash)) return hash;
  return Object.hasOwn(ROUTE_ALIASES, hash) ? ROUTE_ALIASES[hash] : 'learning-path';
}

function showRoute(route, { focusHeading = false, focusLesson } = {}) {
  const selected = ROUTES[route];
  for (const [name, view] of Object.entries(ROUTES)) view.panel.hidden = name !== route;
  for (const link of document.querySelectorAll('.nav-link[data-route]')) {
    const current = link.dataset.route === route;
    link.classList.toggle('is-current', current);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.querySelector('#page-title').textContent = selected.title;
  document.querySelector('#page-description').textContent = selected.description;
  document.title = `LearnLoop · ${selected.label}`;
  activeRoute = route;
  if (route === 'learning-path' && lessonControls.has(focusLesson)) lessonControls.get(focusLesson).input.focus();
  else if (focusHeading) selected.heading.focus();
}

function syncRouteFromLocation() {
  const route = routeFromHash();
  const focusWasInPreviousView = ROUTES[activeRoute].panel.contains(document.activeElement);
  if (window.location.hash !== `#${route}`) window.history.replaceState(null, '', `#${route}`);
  showRoute(route, { focusHeading: route !== activeRoute && focusWasInPreviousView });
}

document.addEventListener('click', (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest('a[data-route]') : null;
  if (!link || !Object.hasOwn(ROUTES, link.dataset.route)) return;
  event.preventDefault();
  const route = link.dataset.route;
  if (window.location.hash !== `#${route}`) window.history.pushState(null, '', `#${route}`);
  showRoute(route, { focusHeading: true, focusLesson: link.dataset.focusLesson });
});

window.addEventListener('popstate', syncRouteFromLocation);
window.addEventListener('hashchange', syncRouteFromLocation);

document.querySelector('#complete-all').addEventListener('click', () => {
  completedIds = new Set(validIds);
  updateProgress();
  saveProgress('All six lessons complete.');
});

document.querySelector('#reset-progress').addEventListener('click', () => {
  completedIds = new Set();
  updateProgress();
  saveProgress('Progress reset.');
});

loadProgress();
createLessonControls();
createProgressLessonRows();
updateProgress();
syncRouteFromLocation();
