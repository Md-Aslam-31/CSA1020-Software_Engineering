(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { tasks: [], stats: {}, events: [], view: 'board', busy: false, dragging: null };
  const statusNames = { todo: 'To do', doing: 'In progress', done: 'Done' };
  const priorityRank = { high: 0, medium: 1, low: 2 };
  let toastTimer, confirmResolve;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something did not save. Please try again.');
    return data;
  }
  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
  }
  function dateLabel(value) {
    if (!value) return 'No due date';
    const date = new Date(`${value}T12:00:00`);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const day = Math.round((date - today) / 86400000);
    if (day === 0) return 'Today';
    if (day === 1) return 'Tomorrow';
    if (day === -1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function filteredTasks() {
    const search = $('#search').value.trim().toLowerCase();
    const priority = $('#priority-filter').value;
    const category = $('#category-filter').value;
    const sort = $('#sort').value;
    const tasks = state.tasks.filter(task => (!priority || task.priority === priority) && (!category || task.category === category) && (!search || [task.title, task.notes, task.category].join(' ').toLowerCase().includes(search)));
    tasks.sort((a, b) => {
      if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority] || b.id - a.id;
      if (sort === 'due') return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31') || b.id - a.id;
      if (sort === 'title') return a.title.localeCompare(b.title);
      return new Date(b.created_at) - new Date(a.created_at) || b.id - a.id;
    });
    $('#clear-filters').hidden = !search && !priority && !category && sort === 'created';
    return tasks;
  }
  function renderCategories() {
    const previous = $('#category-filter').value;
    const categories = [...new Set(state.tasks.map(task => task.category).filter(Boolean))].sort();
    const filter = $('#category-filter'); filter.replaceChildren(new Option('All categories', ''));
    categories.forEach(category => filter.add(new Option(category, category)));
    filter.value = categories.includes(previous) ? previous : '';
    $('#category-suggestions').replaceChildren(...categories.map(category => { const option = el('option'); option.value = category; return option; }));
  }
  function renderStats() {
    $('#nav-total').textContent = state.stats.total || 0;
    $('#stat-total').textContent = state.stats.total || 0;
    $('#stat-doing').textContent = state.stats.doing || 0;
    $('#stat-done').textContent = state.stats.done || 0;
    const completion = Number(state.stats.completion ?? state.stats.completion_percent ?? 0);
    $('#stat-completion').replaceChildren(document.createTextNode(Math.round(completion)), el('span', '', '%'));
    $('#completion-bar').style.width = `${Math.max(0, Math.min(100, completion))}%`;
    $('#done-note').textContent = state.stats.done ? `${state.stats.done} small victories. Well done.` : 'Your first win is waiting.';
    $('#progress-note').textContent = state.stats.overdue ? `${state.stats.overdue} overdue ${state.stats.overdue === 1 ? 'task needs' : 'tasks need'} a little attention.` : 'Every finished task counts.';
  }
  function completionButton(task) {
    const button = el('button', `complete-button${task.status === 'done' ? ' checked' : ''}`, task.status === 'done' ? '✓' : '');
    button.setAttribute('aria-label', task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`);
    button.dataset.testid = `complete-${task.id}`;
    button.addEventListener('click', event => { event.stopPropagation(); updateStatus(task, task.status === 'done' ? 'todo' : 'done'); });
    return button;
  }
  function statusSelect(task) {
    const select = el('select', 'status-menu');
    select.setAttribute('aria-label', `Status for ${task.title}`);
    select.dataset.testid = `status-${task.id}`;
    Object.entries(statusNames).forEach(([value, name]) => select.add(new Option(name, value)));
    select.value = task.status;
    select.addEventListener('change', () => updateStatus(task, select.value));
    select.addEventListener('click', event => event.stopPropagation());
    return select;
  }
  function priorityTag(task) { return el('span', `priority ${task.priority}`, `${task.priority[0].toUpperCase()}${task.priority.slice(1)}`); }
  function dueTag(task) { return el('span', `due${task.overdue ? ' overdue' : ''}`, `${task.overdue ? '◷ ' : '◷ '}${dateLabel(task.due_date)}`); }
  function editButton(task) {
    const button = el('button', 'card-edit', '···');
    button.setAttribute('aria-label', `Edit ${task.title}`); button.dataset.testid = `edit-${task.id}`;
    button.addEventListener('click', () => openTask(task));
    return button;
  }
  function taskCard(task) {
    const card = el('article', 'task-card'); card.draggable = true; card.dataset.taskId = task.id; card.dataset.testid = `task-${task.id}`;
    card.addEventListener('dragstart', event => {
      if (['BUTTON', 'SELECT', 'OPTION'].includes(event.target.tagName)) { event.preventDefault(); return; }
      state.dragging = task.id; event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => { state.dragging = null; card.classList.remove('dragging'); $$('.drag-over').forEach(column => column.classList.remove('drag-over')); });
    const top = el('div', 'card-top'); top.append(el('span', 'category-tag', task.category || 'YOUR NEXT STEP'), editButton(task));
    const titleRow = el('div', 'card-title-row'); titleRow.append(completionButton(task), el('h3', 'card-title', task.title));
    card.append(top, titleRow);
    if (task.notes) card.append(el('p', 'card-notes', task.notes));
    const footer = el('div', 'card-footer'); footer.append(priorityTag(task), dueTag(task));
    card.append(footer, statusSelect(task));
    return card;
  }
  function renderTasks() {
    const tasks = filteredTasks();
    $('#result-count').textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}${tasks.length !== state.tasks.length ? ` of ${state.tasks.length}` : ' in your workspace'}`;
    const board = $('#board-view'); board.replaceChildren();
    Object.entries(statusNames).forEach(([status, name]) => {
      const column = el('section', `column ${status}`); column.dataset.status = status; column.dataset.testid = `column-${status}`; column.setAttribute('aria-label', `${name} tasks`);
      const group = tasks.filter(task => task.status === status);
      const header = el('div', 'column-header'); header.append(el('span', 'column-dot'), document.createTextNode(name), el('small', '', group.length));
      const add = el('button', '', '＋'); add.setAttribute('aria-label', `Add task to ${name}`); add.addEventListener('click', () => openTask(null, status)); header.append(add);
      column.append(header);
      if (!group.length) column.append(el('div', 'empty-column', status === 'done' ? 'Your next small victory belongs here.' : 'A little space for your next step.'));
      group.forEach(task => column.append(taskCard(task)));
      const addBottom = el('button', 'column-add', '＋ Add a task'); addBottom.addEventListener('click', () => openTask(null, status)); column.append(addBottom);
      column.addEventListener('dragover', event => { if (state.dragging) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; column.classList.add('drag-over'); } });
      column.addEventListener('dragleave', event => { if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over'); });
      column.addEventListener('drop', event => { event.preventDefault(); column.classList.remove('drag-over'); const id = Number(event.dataTransfer.getData('text/plain')); const task = state.tasks.find(item => item.id === id); if (task && task.status !== status) updateStatus(task, status); });
      board.append(column);
    });
    const list = $('#list-view'); list.replaceChildren();
    if (!tasks.length) {
      const empty = el('div', 'empty-state'); empty.append(el('h3', '', 'A little room to begin.'), el('p', '', state.tasks.length ? 'Try changing your filters to find the task you need.' : 'Create your first task and take the next small step.')); list.append(empty);
    } else {
      const wrapper = el('div', 'task-list');
      tasks.forEach(task => {
        const row = el('article', 'list-row'); row.dataset.taskId = task.id;
        const name = el('div', 'list-name', task.title); name.append(el('small', '', task.category || 'Uncategorized'));
        row.append(completionButton(task), name, statusSelect(task), priorityTag(task), dueTag(task), editButton(task)); wrapper.append(row);
      }); list.append(wrapper);
    }
  }
  function renderActivity() {
    const list = $('#activity-list'); list.replaceChildren();
    if (!state.events.length) { const empty = el('div', 'empty-state'); empty.append(el('h3', '', 'Your story starts here.'), el('p', '', 'Create or update a task to see your activity.')); list.append(empty); return; }
    state.events.forEach(event => {
      const row = el('article', 'activity-event'); const details = el('div', 'event-details');
      const action = String(event.action || 'updated').replaceAll('_', ' ');
      details.append(el('strong', '', `${action.charAt(0).toUpperCase()}${action.slice(1)} · ${event.title || event.task_title || 'Workspace'}`));
      const time = new Date(event.created_at); const date = el('time', '', Number.isNaN(time.getTime()) ? event.created_at || '' : time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })); if (!Number.isNaN(time.getTime())) date.dateTime = time.toISOString(); details.append(date);
      row.append(el('span', 'event-icon', event.action === 'created' ? '＋' : '✓'), details); list.append(row);
    });
  }
  async function refresh() {
    try {
      const [tasks, stats, activity] = await Promise.all([api('/api/tasks'), api('/api/stats'), api('/api/activity')]);
      state.tasks = tasks.tasks; state.stats = stats; state.events = activity.events;
      $('#load-error').hidden = true; renderCategories(); renderStats(); renderTasks(); renderActivity();
    } catch (error) { $('#load-error span').textContent = error.message; $('#load-error').hidden = false; $('#result-count').textContent = 'Your workspace is temporarily unavailable.'; }
  }
  function setView(view) {
    state.view = view;
    $('#board-view').hidden = view !== 'board'; $('#list-view').hidden = view !== 'list'; $('#activity-view').hidden = view !== 'activity';
    $('#toolbar').hidden = view === 'activity'; $('.view-switch').hidden = view === 'activity';
    $$('.nav-button').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    $$('.view-switch button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const names = { board: 'My board', list: 'All tasks', activity: 'Activity' }; $('#breadcrumb-view').textContent = names[view];
    $('#view-title').textContent = view === 'activity' ? 'Your progress, remembered' : view === 'list' ? 'Everything in one place' : 'The bigger picture';
    $('#result-count').hidden = view === 'activity';
  }
  function openTask(task = null, status = 'todo') {
    $('#task-form').reset(); $('#form-error').hidden = true;
    $('#task-id').value = task?.id || ''; $('#task-title').value = task?.title || ''; $('#task-notes').value = task?.notes || ''; $('#task-priority').value = task?.priority || 'medium'; $('#task-status').value = task?.status || status; $('#task-due').value = task?.due_date || ''; $('#task-category').value = task?.category || '';
    $('#dialog-title').textContent = task ? 'A little room to refine.' : 'Make a little plan.'; $('#save-task').textContent = task ? 'Save changes' : 'Create task'; $('#delete-task').hidden = !task;
    $('#task-dialog').showModal(); setTimeout(() => $('#task-title').focus(), 50);
  }
  async function updateStatus(task, status) {
    try { await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); toast(status === 'done' ? 'One more thing done. A little victory worth celebrating.' : `Moved to ${statusNames[status].toLowerCase()}.`); } catch (error) { toast(error.message); renderTasks(); }
  }
  function confirm(title, description, label = 'Delete task') {
    $('#confirm-title').textContent = title; $('#confirm-description').textContent = description; $('#confirm-ok').textContent = label; $('#confirm-cancel').textContent = label === 'Delete task' ? 'Keep it' : 'Cancel';
    $('#confirm-dialog').showModal(); return new Promise(resolve => { confirmResolve = resolve; });
  }
  function finishConfirm(value) { $('#confirm-dialog').close(); if (confirmResolve) { confirmResolve(value); confirmResolve = null; } }
  $('#task-form').addEventListener('submit', async event => {
    event.preventDefault(); const id = $('#task-id').value; const save = $('#save-task'); save.disabled = true; $('#form-error').hidden = true;
    const payload = { title: $('#task-title').value.trim(), notes: $('#task-notes').value.trim(), priority: $('#task-priority').value, status: $('#task-status').value, due_date: $('#task-due').value || null, category: $('#task-category').value.trim() };
    try { await api(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); $('#task-dialog').close(); await refresh(); toast(id ? 'Your task is updated. Keep making it your own.' : 'A fresh intention, saved. You’ve got this.'); } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; } finally { save.disabled = false; }
  });
  $('#delete-task').addEventListener('click', async () => {
    const id = $('#task-id').value; if (!id) return;
    if (!await confirm('Let this task go?', 'This removes the task from your workspace. This action cannot be undone.')) return;
    try { await api(`/api/tasks/${id}`, { method: 'DELETE' }); $('#task-dialog').close(); await refresh(); toast('Task deleted. A little more room to focus.'); } catch (error) { toast(error.message); }
  });
  $('#new-task').addEventListener('click', () => openTask());
  $$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  $('#confirm-ok').addEventListener('click', () => finishConfirm(true)); $('#confirm-cancel').addEventListener('click', () => finishConfirm(false)); $('#confirm-dialog').addEventListener('cancel', () => { if (confirmResolve) confirmResolve(false); confirmResolve = null; });
  ['search', 'priority-filter', 'category-filter', 'sort'].forEach(id => $(`#${id}`).addEventListener(id === 'search' ? 'input' : 'change', renderTasks));
  $('#clear-filters').addEventListener('click', () => { $('#search').value = ''; $('#priority-filter').value = ''; $('#category-filter').value = ''; $('#sort').value = 'created'; renderTasks(); });
  $('#retry-button').addEventListener('click', refresh);
  $('#export-button').addEventListener('click', async () => {
    try { const data = await api('/api/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const anchor = el('a'); anchor.href = url; anchor.download = `morrow-tasks-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your task backup is ready to download.'); } catch (error) { toast(error.message); }
  });
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 1024 * 1024) throw new Error('Choose a JSON backup smaller than 1 MB.'); const data = JSON.parse(await file.text()); const tasks = Array.isArray(data) ? data : data.tasks; if (!Array.isArray(tasks)) throw new Error('This file must contain a tasks array.'); if (!await confirm('Bring these tasks into Morrow?', `${tasks.length} tasks will be added to your workspace. Your existing tasks will stay as they are.`, 'Import tasks')) return; const result = await api('/api/import', { method: 'POST', body: JSON.stringify({ tasks }) }); await refresh(); toast(`${result.imported ?? tasks.length} tasks imported. A fresh start, together.`); } catch (error) { toast(error instanceof SyntaxError ? 'That file is not valid JSON. Choose a Morrow task backup.' : error.message); } finally { event.target.value = ''; }
  });
  $('#reset-demo').addEventListener('click', async () => {
    if (!await confirm('Start the sample workspace again?', 'This will permanently replace all current tasks with the six sample tasks. Export your work first if you want to keep it.', 'Reset samples')) return;
    try { await api('/api/demo/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) }); await refresh(); toast('Your sample workspace is ready for another fresh start.'); } catch (error) { toast(error.message); }
  });
  $('#theme-button').addEventListener('click', () => { const dark = document.body.classList.toggle('dark'); try { localStorage.setItem('morrow-theme', dark ? 'dark' : 'light'); } catch (_) {} });
  try { document.body.classList.toggle('dark', localStorage.getItem('morrow-theme') === 'dark'); } catch (_) {}
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || $('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); openTask(); }
    if (event.key === '/') { event.preventDefault(); if (state.view === 'activity') setView('board'); $('#search').focus(); }
  });
  $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  refresh();
})();
