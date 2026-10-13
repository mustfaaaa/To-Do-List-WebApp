import { STORAGE_KEY, initialState, loadState, validateState, parseQuick, makeTask, updateTask, visibleTasks, metrics, localDay, timerRemaining } from './model.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paths = {
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M6 8v3m6-3v6m6-6v2"/>',
  check: '<path d="m6 12 4 4 8-8"/>',
  command: '<path d="M9 7V4a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v16a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2z"/>',
  moon: '<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  activity: '<path d="M3 17V9m6 8V4m6 13v-6m6 6V7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.plus}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
document.querySelector('.utility[data-action="palette"] kbd').textContent = navigator.platform.includes('Mac') ? '⌘ K' : 'Ctrl K';
$('timer-display').setAttribute('role', 'timer');
$('full-timer-display').setAttribute('role', 'timer');
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } }; }
const loaded = loadState(storage);
let state = loaded.state;
let storageBlocked = Boolean(loaded.error);
let view = ['today', 'upcoming', 'all', 'board', 'completed'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
let scope = 'all';
let pendingImport = null;
let lastDay = localDay();
let activeCommand = 0;
let commandsShown = [];
const dialogFocus = new WeakMap();
const timers = { focus: 1500, short: 300, long: 900 };
let timer = { mode: 'focus', remaining: 1500, running: false, endsAt: null, taskId: '', sessionId: crypto.randomUUID() };
try {
  const saved = JSON.parse(storage.getItem('flowstate.timer.v1'));
  if (saved && Object.hasOwn(timers, saved.mode) && Number.isInteger(saved.remaining) && saved.remaining >= 0 && saved.remaining <= timers[saved.mode] && typeof saved.running === 'boolean' && (!saved.running || Number.isFinite(saved.endsAt)) && typeof saved.taskId === 'string' && typeof saved.sessionId === 'string') timer = saved;
} catch { /* An invalid timer never prevents task recovery. */ }

function toast(message, action, callback, lifetime = 6000) {
  const element = document.createElement('div'); element.className = 'toast'; element.setAttribute('role', 'status');
  const label = document.createElement('span'); label.textContent = message; element.append(label);
  if (action) { const button = document.createElement('button'); button.textContent = action; button.onclick = () => { callback(); element.remove(); }; element.append(button); }
  const close = document.createElement('button'); close.className = 'toast-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss notification'); close.onclick = () => element.remove(); element.append(close);
  $('toasts').querySelectorAll('.toast:not([data-actionable])').forEach(previous => previous.remove());
  element.toggleAttribute('data-actionable', Boolean(action));
  $('toasts').append(element);
  let timeout = setTimeout(() => element.remove(), lifetime);
  element.onmouseenter = element.onfocusin = () => clearTimeout(timeout);
  element.onmouseleave = element.onfocusout = () => { timeout = setTimeout(() => element.remove(), lifetime); };
}
function warning(message, recovery = false) {
  $('storage-warning').hidden = false;
  $('storage-warning').textContent = message;
  if (recovery) {
    const button = document.createElement('button'); button.className = 'secondary'; button.textContent = 'Use a fresh workspace'; button.style.marginLeft = '12px';
    button.onclick = async () => {
      if (!await confirmAction('Start with a fresh workspace?', 'The unreadable data will be kept under flowstate.recovery in this browser. You can also import a valid JSON backup instead.', 'Start fresh')) return;
      try { const raw = storage.getItem(STORAGE_KEY); if (raw) storage.setItem('flowstate.recovery', raw); storageBlocked = false; if (persist()) { $('storage-warning').hidden = true; toast('Fresh workspace ready.'); } }
      catch { warning('Browser storage is unavailable. You can work in this tab and export your data, but changes cannot be saved after closing it.'); }
    }; $('storage-warning').append(button);
  }
}
if (loaded.error) warning(loaded.error + ' New changes are temporary until you restore a backup or choose a fresh workspace.', true);
function persist() {
  if (storageBlocked) return false;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { warning('Changes are available in this tab, but browser storage is full or unavailable. Export your data in Settings to keep a backup.'); return false; }
}
function persistTimer() { try { if (!storageBlocked) storage.setItem('flowstate.timer.v1', JSON.stringify(timer)); } catch { /* Task persistence warning already explains storage limitations. */ } }
function commit() { const saved = persist(); render(); return saved; }
function formatDay(day, options = { month: 'short', day: 'numeric' }) { return new Date(day + 'T12:00:00').toLocaleDateString(undefined, options); }
function deadline(task) {
  if (task.status === 'done') return { text: `Completed ${formatDay(localDay(new Date(task.completedAt)))}`, className: '' };
  if (!task.dueDate) return { text: '', className: '' };
  if (task.dueDate < localDay()) return { text: `${formatDay(task.dueDate)} · overdue`, className: 'due-overdue' };
  return { text: task.dueDate === localDay() ? 'Today' : formatDay(task.dueDate), className: '' };
}
function taskMeta(task) {
  const due = deadline(task);
  return `<div class="task-meta"><span class="priority-${escape(task.priority)}"><i class="priority-dot"></i>${task.priority[0].toUpperCase() + task.priority.slice(1)}</span>${task.category ? `<span>#${escape(task.category)}</span>` : ''}${due.text ? `<span class="${due.className}">${icon('calendar')}${escape(due.text)}</span>` : ''}${task.duration ? `<span>${icon('clock')}${task.duration}m</span>` : ''}${task.status === 'progress' ? '<span>In progress</span>' : ''}</div>`;
}
function actions(task) {
  return ['focus', 'edit', 'delete'].map(action => `<button class="${action === 'delete' ? 'destructive' : ''}" data-task-action="${action}" data-id="${escape(task.id)}" aria-label="${action[0].toUpperCase() + action.slice(1)} ${action === 'focus' ? 'on ' : ''}${escape(task.title)}">${icon({ focus: 'play', edit: 'edit', delete: 'trash' }[action])}${{ focus: 'Focus on task', edit: 'Edit task', delete: 'Delete task' }[action]}</button>`).join('');
}
function taskMenu(task) { return `<details class="task-menu"><summary aria-label="Actions for ${escape(task.title)}" title="Task actions">${icon('more')}</summary><div class="task-menu-popover">${actions(task)}</div></details>`; }
function row(task) {
  return `<article class="task-row ${task.status === 'done' ? 'is-done' : ''}" data-row-id="${escape(task.id)}"><button class="task-check" data-task-action="complete" data-id="${escape(task.id)}" aria-label="${task.status === 'done' ? 'Reopen' : 'Complete'} ${escape(task.title)}" aria-pressed="${task.status === 'done'}">${task.status === 'done' ? icon('check') : ''}</button><div class="task-body"><button class="task-title" data-task-action="edit" data-id="${escape(task.id)}">${escape(task.title)}</button>${task.description ? `<p class="task-description">${escape(task.description)}</p>` : ''}${taskMeta(task)}</div><div class="task-actions"><button class="icon-button row-focus" data-task-action="focus" data-id="${escape(task.id)}" aria-label="Start focus on ${escape(task.title)}" title="Focus on task">${icon('play')}</button>${taskMenu(task)}</div></article>`;
}
function board(tasks) {
  const names = ['To do', 'In progress', 'Done'];
  return '<div class="board">' + ['todo', 'progress', 'done'].map((status, i) => {
    const column = tasks.filter(t => t.status === status);
    return `<section class="board-column" data-status="${status}"><div class="column-heading"><span class="column-status" aria-hidden="true"></span><h3>${names[i]}</h3><span>${column.length}</span><button class="icon-button" data-action="new-column" data-status="${status}" aria-label="Add task to ${names[i]}">${icon('plus')}</button></div>${column.map(task => `<article class="board-card ${status === 'done' ? 'is-done' : ''}"><div class="board-card-heading"><button class="task-title" data-task-action="edit" data-id="${escape(task.id)}">${escape(task.title)}</button>${taskMenu(task)}</div>${task.description ? `<p class="task-description">${escape(task.description)}</p>` : ''}${taskMeta(task)}<select data-move-id="${escape(task.id)}" aria-label="Move ${escape(task.title)} to workflow column">${['todo', 'progress', 'done'].map((s, index) => `<option value="${s}" ${status === s ? 'selected' : ''}>${names[index]}</option>`).join('')}</select></article>`).join('') || `<p class="column-empty">${['Ready for your next intention.', 'Work you’ve begun will appear here.', 'A quiet record of things finished.'][i]}</p>`}<button class="column-add" data-action="new-column" data-status="${status}">${icon('plus')}Add task</button></section>`;
  }).join('') + '</div>';
}
const viewText = {
  today: ['Make space for today', 'Choose what matters. Take it one thing at a time.', 'Your attention'],
  upcoming: ['Room for what’s next', 'Your future commitments, organised by day.', 'On the horizon'],
  all: ['Everything, in its place', 'The whole picture. One manageable step at a time.', 'Your collection'],
  completed: ['Time well spent', 'A record of the things you moved forward.', 'Completed work'],
  board: ['From intention to action', 'A simple rhythm: begin, make progress, finish.', 'Work in motion']
};
function filterOptions() { return { view, search: $('search').value, priority: $('priority-filter').value, category: $('category-filter').value, sort: $('sort').value }; }
function renderTasks() {
  const options = filterOptions();
  const tasks = visibleTasks(state.tasks, options).filter(task => view !== 'all' || scope === 'all' || (scope === 'active' ? task.status !== 'done' : task.status === 'done'));
  $('list-count').textContent = tasks.length;
  $('clear-filters').hidden = !options.search && !options.priority && !options.category && (view !== 'all' || scope === 'all');
  if (view === 'board') { $('task-list').innerHTML = (state.tasks.length && !tasks.length ? '<p class="board-empty-note">No tasks match these filters. <button class="text-button" data-action="clear">Clear filters</button></p>' : '') + board(tasks); return; }
  if (!tasks.length) {
    const filtered = options.search || options.priority || options.category || (view === 'all' && scope !== 'all');
    const hasOther = state.tasks.some(t => t.status !== 'done');
    const heading = filtered ? 'A little too specific?' : view === 'completed' ? 'Your progress belongs here.' : view === 'upcoming' ? 'Room on the horizon.' : view === 'today' && hasOther ? 'A clear day ahead.' : 'A clear page. A fresh start.';
    const copy = filtered ? 'No tasks match these filters. Try a broader search.' : view === 'completed' ? 'Finish your first task and it will find a home here. Every small step counts.' : view === 'upcoming' ? 'Future tasks will appear here, organised by due date. Make a little space for what’s next.' : view === 'today' && hasOther ? 'Today brings together overdue work, tasks due today, high priorities, and work in progress.' : 'You don’t have to do everything. Start with one thing that matters to you.';
    $('task-list').innerHTML = `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">${icon({ today: 'sun', upcoming: 'calendar', completed: 'check', all: 'layers' }[view])}</div><div><h3>${heading}</h3><p>${copy}</p><button class="${filtered ? 'secondary' : 'primary'}" ${filtered ? 'data-action="clear"' : view === 'today' && hasOther || view === 'completed' ? 'data-action="all"' : 'data-action="new"'}>${filtered ? 'Clear filters' : view === 'today' && hasOther || view === 'completed' ? 'See all tasks' : 'Create a task'}${icon('arrow')}</button></div></div>`;
  } else if (view === 'upcoming') {
    let date = ''; $('task-list').innerHTML = tasks.map(task => { const group = date !== task.dueDate ? `<h3 class="group-title">${escape(formatDay(task.dueDate, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }))}</h3>` : ''; date = task.dueDate; return group + row(task); }).join('');
  } else {
    const pending = tasks.filter(t => t.status !== 'done'); const completed = tasks.filter(t => t.status === 'done');
    $('task-list').innerHTML = pending.map(row).join('') + (completed.length && pending.length ? `<h3 class="group-title">Completed · ${completed.length}</h3>` : '') + completed.map(row).join('');
  }
}
function render() {
  const data = metrics(state); const now = new Date();
  document.documentElement.dataset.theme = state.preferences.theme;
  document.querySelector('meta[name="theme-color"]').content = state.preferences.theme === 'dark' ? '#101713' : '#f7f8fa';
  $('theme-label').textContent = state.preferences.theme === 'light' ? 'Dark appearance' : 'Light appearance';
  $('settings-theme').textContent = state.preferences.theme === 'light' ? 'Use dark theme' : 'Use light theme';
  const name = state.preferences.name;
  $('profile-name').textContent = name ? `${name}’s workspace` : 'Your workspace'; $('avatar').textContent = name ? [...name][0].toUpperCase() : 'Y';
  $('date-label').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('greeting').textContent = `${now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'}${name ? ', ' + name : ''}.`;
  $('view-title').innerHTML = escape(viewText[view][0]) + '<span class="accent">.</span>';
  $('view-description').textContent = viewText[view][1]; $('list-title').textContent = viewText[view][2];
  $('breadcrumb').textContent = { today: 'Today', upcoming: 'Upcoming', all: 'All tasks', board: 'Board', completed: 'Completed' }[view];
  document.body.classList.toggle('board-view', view === 'board');
  $('task-scope').hidden = view !== 'all';
  document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === scope)));
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  for (const v of ['today', 'upcoming', 'all', 'completed']) $('count-' + v).textContent = visibleTasks(state.tasks, { view: v }).length || '';
  $('intention').innerHTML = escape(state.preferences.focus || 'Make room for what matters.') + icon('edit');
  $('progress-copy').textContent = state.tasks.length ? `${data.done} of ${state.tasks.length} complete` : 'A fresh start';
  $('progress-percent').textContent = data.percentage + '%'; $('progress-fill').style.width = data.percentage + '%';
  $('remaining-copy').textContent = data.remaining ? `${data.remaining} ${data.remaining === 1 ? 'task' : 'tasks'} to move forward` : 'No loose ends.';
  $('completed-today').textContent = data.today; $('remaining').textContent = data.remaining; $('focus-sessions').textContent = data.sessions;
  $('session-note').textContent = data.sessions ? `${data.sessions} focus ${data.sessions === 1 ? 'session' : 'sessions'} completed. Time well spent.` : 'No sessions yet. Your first one starts here.';
  const total = data.activity.reduce((sum, day) => sum + day.count, 0); const max = Math.max(1, ...data.activity.map(day => day.count));
  $('activity-total').textContent = `${total} completed`;
  $('activity-chart').setAttribute('aria-label', 'Task completions: ' + data.activity.map(day => `${formatDay(day.day)}, ${day.count}`).join('; '));
  $('activity-chart').innerHTML = data.activity.map(day => `<div class="chart-column" title="${escape(formatDay(day.day))}: ${day.count} completed"><div class="chart-bar ${day.count ? 'has-value' : ''}" style="height:${day.count ? Math.max(5, day.count / max * 49) : 2}px"></div><span>${escape(formatDay(day.day, { weekday: 'narrow' }))}</span></div>`).join('');
  $('reflection').textContent = data.today ? data.remaining ? `${data.today} ${data.today === 1 ? 'step' : 'steps'} forward today. There’s no need to rush the next one.` : 'Your list is clear. A little space to enjoy what you’ve done.' : total ? 'Every day has its own rhythm. Your next step is yours to choose.' : 'Progress will take shape here. Start with one thing that matters.';
  const achievement = data.done >= 25 ? '↗ Twenty-five things moved forward.' : data.done >= 10 ? '↗ Ten meaningful steps. Keep your own pace.' : data.done >= 1 ? '↗ The first step is a beginning. You’ve made yours.' : '';
  $('achievement').hidden = !achievement; $('achievement').textContent = achievement;
  $('footer-date').textContent = 'FLOWSTATE / ' + now.getFullYear();
  const categories = [...new Set(state.tasks.map(t => t.category).filter(Boolean))].sort(); const selected = $('category-filter').value;
  $('category-filter').innerHTML = '<option value="">All projects</option>' + categories.map(category => `<option value="${escape(category)}">${escape(category)}</option>`).join('');
  if (categories.includes(selected)) $('category-filter').value = selected;
  $('project-options').innerHTML = categories.map(category => `<option value="${escape(category)}"></option>`).join('');
  if (timer.taskId && !state.tasks.some(task => task.id === timer.taskId)) { timer.taskId = ''; persistTimer(); }
  $('focus-task').innerHTML = '<option value="">Open focus · no task selected</option>' + state.tasks.filter(t => t.status !== 'done' || t.id === timer.taskId).map(task => `<option value="${escape(task.id)}">${escape(task.title)}${task.status === 'done' ? ' · completed' : ''}</option>`).join('');
  $('focus-task').value = timer.taskId;
  renderTasks(); renderTimer();
}
function switchView(next) { view = next; history.replaceState(null, '', '#' + next); render(); }
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (viewText[next]) { view = next; render(); } });
function clearFilters() { $('search').value = ''; $('priority-filter').value = ''; $('category-filter').value = ''; scope = 'all'; document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === scope))); renderTasks(); }
function openDialog(id) {
  if ($(id).open) return;
  dialogFocus.set($(id), document.activeElement);
  $(id).showModal();
}
function confirmAction(title, message, action) {
  $('confirmation-heading').textContent = title; $('confirmation-copy').textContent = message; $('confirmation-accept').textContent = action;
  return new Promise(resolve => {
    let accepted = false;
    $('confirmation-accept').onclick = () => { accepted = true; $('confirmation-dialog').close(); };
    $('confirmation-dialog').addEventListener('close', () => resolve(accepted), { once: true });
    openDialog('confirmation-dialog');
  });
}
document.querySelectorAll('dialog').forEach(dialog => {
  if (!dialog.hasAttribute('aria-labelledby')) dialog.setAttribute('aria-label', { 'task-dialog': 'Task details', 'settings-dialog': 'Workspace settings', 'palette-dialog': 'Command menu', 'focus-dialog': 'Focus mode' }[dialog.id] || 'Confirm action');
  dialog.addEventListener('close', () => {
    if (dialog.id === 'import-dialog') pendingImport = null;
    const original = dialogFocus.get(dialog);
    if (!document.querySelector('dialog[open]')) {
      if (original?.isConnected && original.getClientRects().length) original.focus();
      else document.querySelector('.nav-item.active')?.focus();
    }
  });
  // Clicking outside only dismisses the command menu; task forms retain unsaved work.
  if (dialog.id === 'palette-dialog') dialog.addEventListener('click', event => { const rect = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close(); });
});
function openTask(task = null, parsed = null, status = 'todo') {
  $('task-form').reset(); $('task-error').textContent = ''; $('task-timestamps').textContent = '';
  $('task-title').setCustomValidity('');
  const source = task || parsed || {};
  $('task-id').value = task?.id || '';
  $('task-title').value = source.title || ''; $('task-description').value = source.description || '';
  $('task-priority').value = source.priority || 'medium'; $('task-category').value = source.category || '';
  $('task-due').value = source.dueDate || ''; $('task-duration').value = source.duration || '';
  $('task-status').value = source.status || status;
  $('task-dialog-title').textContent = task ? 'Refine your next move.' : parsed ? 'A thought, made concrete.' : 'Make your next move.';
  $('save-task').innerHTML = (task ? 'Save changes' : 'Create task') + icon('arrow');
  if (parsed?.warnings?.length) $('task-error').textContent = parsed.warnings.join(' ');
  if (task) $('task-timestamps').textContent = `Created ${new Date(task.createdAt).toLocaleString()} · Updated ${new Date(task.updatedAt).toLocaleString()}`;
  openDialog('task-dialog'); $('task-title').focus();
}
$('task-title').addEventListener('input', () => $('task-title').setCustomValidity(''));
$('task-form').addEventListener('submit', event => {
  event.preventDefault(); if ($('save-task').disabled) return;
  const title = $('task-title').value.trim();
  if (!title) { $('task-error').textContent = 'Give this task a title before saving.'; $('task-title').setCustomValidity('Please enter a task title.'); $('task-title').reportValidity(); return; }
  const fields = { title, description: $('task-description').value.trim(), priority: $('task-priority').value, category: $('task-category').value.trim(), dueDate: $('task-due').value, duration: $('task-duration').value ? Number($('task-duration').value) : null, status: $('task-status').value };
  $('save-task').disabled = true;
  try {
    const id = $('task-id').value; let task;
    if (id) { const index = state.tasks.findIndex(t => t.id === id); if (index < 0) throw new Error('This task no longer exists.'); task = updateTask(state.tasks[index], fields); const candidate = { ...state, tasks: state.tasks.map(t => t.id === id ? task : t) }; validateState(candidate); state = candidate; }
    else { task = makeTask(fields); const candidate = { ...state, tasks: [...state.tasks, task] }; validateState(candidate); state = candidate; }
    if (!visibleTasks([task], filterOptions()).length) { clearFilters(); switchView(task.status === 'done' ? 'completed' : 'all'); }
    const saved = commit(); $('task-dialog').close(); $('quick-input').value = ''; quickPreview();
    toast(`${id ? 'Task updated.' : 'A new intention, captured.'}${saved ? '' : ' Export to keep your changes.'}`);
  } catch (error) { $('task-error').textContent = error.message; }
  finally { $('save-task').disabled = false; }
});
function quickPreview() {
  const value = $('quick-input').value;
  if (!value.trim()) { $('quick-preview').innerHTML = 'Add a thought. Use <code>#project</code>, <code>tomorrow</code> or <code>25m</code> to give it shape.'; return; }
  const parsed = parseQuick(value);
  $('quick-preview').innerHTML = 'Ready: ' + `<span class="parsed-token">${escape(parsed.title || 'Add a task title')}</span><span class="parsed-token">${parsed.priority}</span>` + (parsed.dueDate ? `<span class="parsed-token">${escape(formatDay(parsed.dueDate))}</span>` : '') + (parsed.category ? `<span class="parsed-token">#${escape(parsed.category)}</span>` : '') + (parsed.duration ? `<span class="parsed-token">${parsed.duration}m</span>` : '') + (parsed.warnings.length ? '<span class="quick-warning">Review conflicting tokens before saving.</span>' : '');
}
$('quick-input').addEventListener('input', quickPreview);
$('quick-form').addEventListener('submit', event => {
  event.preventDefault(); const parsed = parseQuick($('quick-input').value);
  if (!parsed.title) { toast('Add a task title alongside your shorthand.'); $('quick-input').focus(); return; }
  openTask(null, parsed);
});
$('search').addEventListener('input', renderTasks);
for (const id of ['priority-filter', 'category-filter', 'sort']) $(id).addEventListener('change', renderTasks);
$('filter-toggle').onclick = () => { $('filters').hidden = !$('filters').hidden; $('filter-toggle').setAttribute('aria-expanded', String(!$('filters').hidden)); };
$('clear-filters').onclick = clearFilters;
document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => switchView(button.dataset.view); });
document.querySelectorAll('[data-scope]').forEach(button => { button.onclick = () => { scope = button.dataset.scope; document.querySelectorAll('[data-scope]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderTasks(); }; });
document.addEventListener('click', event => {
  const control = event.target.closest('[data-task-action]');
  if (control || !event.target.closest('.task-menu')) document.querySelectorAll('.task-menu[open]').forEach(menu => { menu.open = false; });
  const close = event.target.closest('[data-close]'); if (close) { event.preventDefault(); close.closest('dialog')?.close(); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'new') openTask();
  if (action === 'new-column') openTask(null, null, event.target.closest('[data-action]').dataset.status);
  if (action === 'theme') { state.preferences.theme = state.preferences.theme === 'light' ? 'dark' : 'light'; commit(); }
  if (action === 'settings') openSettings();
  if (action === 'palette') openPalette();
  if (action === 'focus') openFocus();
  if (action === 'clear') clearFilters();
  if (action === 'all') switchView('all');
  if (!control) return;
  const task = state.tasks.find(t => t.id === control.dataset.id); if (!task) return;
  if (control.dataset.taskAction === 'edit') openTask(task);
  if (control.dataset.taskAction === 'focus') selectFocusTask(task.id).then(changed => { if (changed) { render(); openFocus(); } });
  if (control.dataset.taskAction === 'complete') {
    const done = task.status !== 'done'; state.tasks = state.tasks.map(t => t.id === task.id ? updateTask(t, { status: done ? 'done' : 'todo' }) : t); commit();
    const check = document.querySelector(`[data-row-id="${CSS.escape(task.id)}"] .task-check`); check?.classList.add('completion-pop');
    const replacement = document.querySelector(`[data-row-id="${CSS.escape(task.id)}"] .task-check`);
    if (replacement) replacement.focus({ preventScroll: true }); else $('search').focus({ preventScroll: true });
    toast(done ? 'One meaningful step forward.' : 'Task reopened. Ready when you are.');
  }
  if (control.dataset.taskAction === 'delete') {
    const index = state.tasks.indexOf(task); state.tasks = state.tasks.filter(t => t.id !== task.id); commit(); $('search').focus({ preventScroll: true });
    toast('Task deleted.', 'Undo', () => { if (!state.tasks.some(t => t.id === task.id)) { state.tasks.splice(Math.min(index, state.tasks.length), 0, task); commit(); toast('Task restored.'); } }, 12000);
  }
});
$('task-list').addEventListener('change', event => {
  const id = event.target.dataset.moveId; if (!id) return;
  state.tasks = state.tasks.map(task => task.id === id ? updateTask(task, { status: event.target.value }) : task); commit();
  document.querySelector(`[data-move-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); toast('Workflow updated.');
});

function openSettings() { $('settings-name').value = state.preferences.name; $('settings-focus').value = state.preferences.focus; $('import-error').textContent = ''; openDialog('settings-dialog'); }
$('settings-form').onsubmit = event => { event.preventDefault(); state.preferences.name = $('settings-name').value.trim(); state.preferences.focus = $('settings-focus').value.trim() || 'Make room for what matters.'; const saved = commit(); $('settings-dialog').close(); toast(saved ? 'Your space, made personal.' : 'Preferences updated for this tab. Storage is unavailable.'); };
$('export-data').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `flowstate-${localDay()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Your backup is ready to download.');
};
$('import-data').onclick = () => { $('import-file').value = ''; $('import-file').click(); };
$('import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 10 MB.');
    const imported = validateState(JSON.parse(await file.text())); pendingImport = imported;
    $('import-summary').textContent = `This backup contains ${imported.tasks.length} tasks and ${imported.sessions.length} completed focus sessions. Your workspace currently has ${state.tasks.length} tasks.`;
    openDialog('import-dialog');
  } catch (error) { pendingImport = null; $('import-error').textContent = error instanceof SyntaxError ? 'This is not valid JSON. Choose an unmodified FLOWSTATE export.' : error.message; }
};
$('confirm-import').onclick = () => {
  if (!pendingImport) return;
  // Write first: a storage failure must not discard the current in-memory workspace.
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pendingImport));
    state = pendingImport; storageBlocked = false; pendingImport = null; resetTimer(); $('storage-warning').hidden = true; $('toasts').replaceChildren();
    $('import-dialog').close(); $('settings-dialog').close(); clearFilters(); render(); toast('Backup restored. Welcome back.');
  } catch { $('import-dialog').close(); $('import-error').textContent = 'Browser storage is unavailable or full. Your current data was kept. Free storage and try again.'; }
};

function renderTimer() {
  const remaining = timerRemaining(timer); const formatted = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  $('timer-display').textContent = formatted; $('full-timer-display').textContent = formatted;
  $('timer-ring').style.strokeDashoffset = String(565.49 * (1 - remaining / timers[timer.mode]));
  const label = timer.running ? 'Pause session' : remaining < timers[timer.mode] ? 'Resume session' : timer.mode === 'focus' ? 'Start focusing' : 'Start break';
  $('full-timer-start').innerHTML = icon(timer.running ? 'pause' : 'play') + `<span>${label}</span>`;
  $('dock-timer').textContent = formatted; $('dock-timer').hidden = !timer.running && remaining === timers[timer.mode];
  $('timer-mode').textContent = timer.mode === 'focus' ? 'One thing at a time' : 'A moment to recharge';
  $('timer-status').textContent = timer.running ? 'One thing at a time' : remaining < timers[timer.mode] ? 'Take your time · paused' : `A fresh ${timers[timer.mode] / 60} minutes`;
  $('focus-full-mode').textContent = { focus: 'Focus session · 25 minutes', short: 'Short break · 5 minutes', long: 'Long break · 15 minutes' }[timer.mode];
  $('focus-full-title').textContent = state.tasks.find(task => task.id === timer.taskId)?.title || (timer.mode === 'focus' ? 'A little space to think.' : 'Step away. Come back fresh.');
  document.querySelectorAll('[data-preset]').forEach(button => { button.classList.toggle('selected', button.dataset.preset === timer.mode); button.setAttribute('aria-pressed', String(button.dataset.preset === timer.mode)); });
  $('focus-task').disabled = timer.running;
  if ($('focus-dialog').open && timer.running) document.title = `${formatted} · FLOWSTATE`; else document.title = 'FLOWSTATE — Make room for what matters';
}
function finishSession() {
  const focus = timer.mode === 'focus';
  if (focus && !state.sessions.some(session => session.id === timer.sessionId)) {
    state.sessions.push({ id: timer.sessionId, taskId: timer.taskId || null, completedAt: new Date(timer.endsAt || Date.now()).toISOString(), minutes: 25 }); persist();
  }
  timer.running = false; timer.remaining = timers[timer.mode]; timer.endsAt = null; timer.sessionId = crypto.randomUUID(); persistTimer(); render();
  $('focus-full-feedback').textContent = focus ? 'A session well spent. Take a breath before the next step.' : 'A little room to recharge. Ready when you are.';
  toast(focus ? '25 minutes of focus, complete. Take a well-earned break.' : 'Your break is complete. Ease back in.', focus ? 'Short break' : undefined, focus ? () => setPreset('short') : undefined, 12000);
}
function tick() {
  if (timer.running && timerRemaining(timer) === 0) finishSession();
  else if (timer.running) renderTimer();
  if (lastDay !== localDay()) { lastDay = localDay(); render(); }
}
function toggleTimer() {
  if (timer.running) { const remaining = timerRemaining(timer); if (!remaining) { finishSession(); return; } timer.remaining = remaining; timer.running = false; timer.endsAt = null; }
  else { timer.endsAt = Date.now() + timer.remaining * 1000; timer.running = true; $('focus-full-feedback').textContent = 'One breath. One thing. One step forward.'; }
  persistTimer(); renderTimer();
}
function resetTimer() { timer.running = false; timer.endsAt = null; timer.remaining = timers[timer.mode]; timer.sessionId = crypto.randomUUID(); persistTimer(); renderTimer(); }
async function setPreset(mode) {
  if (mode === timer.mode) return;
  if ((timer.running || timer.remaining < timers[timer.mode]) && !await confirmAction('Start a different session?', 'Switching presets resets your current session. Completed focus history will be kept.', 'Switch preset')) return;
  timer.mode = mode; resetTimer();
}
async function selectFocusTask(id) {
  if (timer.taskId === id) return true;
  if (timer.running) { toast('Pause or reset the current session before changing its task.'); return false; }
  if (timer.remaining < timers[timer.mode] && !await confirmAction('Focus on something else?', 'Changing the task resets this paused session so its time belongs to the right task.', 'Change task')) return false;
  timer.taskId = id; resetTimer(); return true;
}
$('full-timer-start').onclick = toggleTimer;
$('full-timer-reset').onclick = () => { resetTimer(); toast('Timer reset. A fresh start.'); };
document.querySelectorAll('[data-preset]').forEach(button => { button.onclick = () => setPreset(button.dataset.preset); });
$('focus-task').onchange = async () => { const id = $('focus-task').value; if (!await selectFocusTask(id)) $('focus-task').value = timer.taskId; };
function openFocus() { render(); openDialog('focus-dialog'); }
$('focus-dialog').addEventListener('close', renderTimer);
// One clock for the entire app. Absolute deadlines survive throttling and reloads.
const interval = setInterval(tick, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.addEventListener('pagehide', () => { persistTimer(); clearInterval(interval); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

const commandDefinitions = [
  { label: 'Create a new task', icon: 'plus', key: 'N', action: () => openTask() },
  ...Object.keys(viewText).map(v => ({ label: `Go to ${v === 'all' ? 'All tasks' : v[0].toUpperCase() + v.slice(1)}`, icon: { today: 'sun', upcoming: 'calendar', all: 'layers', board: 'board', completed: 'check' }[v], action: () => switchView(v) })),
  { label: 'Enter focus mode', icon: 'expand', action: openFocus },
  { label: 'Toggle light / dark appearance', icon: 'moon', action: () => { state.preferences.theme = state.preferences.theme === 'light' ? 'dark' : 'light'; commit(); } },
  { label: 'Settings, export & import', icon: 'settings', action: openSettings }
];
function renderCommands() {
  commandsShown = commandDefinitions.filter(command => command.label.toLowerCase().includes($('command-input').value.toLowerCase()));
  activeCommand = Math.min(activeCommand, Math.max(0, commandsShown.length - 1));
  $('command-list').innerHTML = commandsShown.map((command, index) => `<button class="command-item ${index === activeCommand ? 'selected' : ''}" data-command="${index}">${icon(command.icon)}<span>${command.label}</span>${command.key ? `<kbd>${command.key}</kbd>` : ''}</button>`).join('') || '<div class="palette-empty">No matching commands. Try “task” or “focus”.</div>';
}
function openPalette() { $('command-input').value = ''; activeCommand = 0; renderCommands(); openDialog('palette-dialog'); $('command-input').focus(); }
function runCommand(index) { const command = commandsShown[index]; if (!command) return; $('palette-dialog').close(); command.action(); }
$('command-input').oninput = () => { activeCommand = 0; renderCommands(); };
$('command-list').onclick = event => { const button = event.target.closest('[data-command]'); if (button) runCommand(Number(button.dataset.command)); };
$('command-input').onkeydown = event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); activeCommand = commandsShown.length ? (activeCommand + (event.key === 'ArrowDown' ? 1 : -1) + commandsShown.length) % commandsShown.length : 0; renderCommands(); }
  if (event.key === 'Enter') { event.preventDefault(); runCommand(activeCommand); }
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { const menu = document.querySelector('.task-menu[open]'); if (menu) { menu.open = false; menu.querySelector('summary').focus(); event.preventDefault(); } }
  if (event.defaultPrevented || event.repeat || event.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); openTask(); }
  if (event.key === '/') { event.preventDefault(); $('search').focus(); }
});
document.addEventListener('toggle', event => {
  if (event.target.matches('.task-menu[open]')) document.querySelectorAll('.task-menu[open]').forEach(menu => { if (menu !== event.target) menu.open = false; });
}, true);
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  // Never overwrite an unsaved form in a second tab. Ask it to refresh after saving.
  if (document.querySelector('dialog[open]')) { toast('Workspace changed in another tab. Refresh after saving or cancelling your form.', undefined, undefined, 12000); return; }
  const result = loadState(storage); if (!result.error) { state = result.state; render(); toast('Workspace updated from another tab.'); }
});
render(); tick();
