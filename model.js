export const STORAGE_KEY = 'flowstate.v1';
export const priorities = ['high', 'medium', 'low'];
export const statuses = ['todo', 'progress', 'done'];
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dayOffset(offset, now = new Date()) {
  const date = new Date(now); date.setDate(date.getDate() + offset); return localDay(date);
}
export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00'); return !Number.isNaN(+date) && localDay(date) === value;
}
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const initialState = () => ({ version: 1, tasks: [], sessions: [], preferences: { theme: 'light', name: '', focus: 'Make room for what matters.' } });
export function validateState(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.sessions) || !data.preferences) throw new Error('Choose a FLOWSTATE version 1 JSON export.');
  if (data.tasks.length > 10000 || data.sessions.length > 50000) throw new Error('This file exceeds the supported data size.');
  const ids = new Set();
  const tasks = data.tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id) || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200 || typeof task.description !== 'string' || task.description.length > 5000 || typeof task.category !== 'string' || task.category.length > 50 || !priorities.includes(task.priority) || !statuses.includes(task.status) || !(task.dueDate === '' || validDay(task.dueDate)) || !(task.duration === null || Number.isInteger(task.duration) && task.duration > 0 && task.duration <= 1440) || !timestamp(task.createdAt) || !timestamp(task.updatedAt) || !(task.completedAt === null || timestamp(task.completedAt)) || (task.status === 'done') !== (task.completedAt !== null)) throw new Error('The file contains an invalid or duplicate task. No data was replaced.');
    ids.add(task.id);
    return { id: task.id, title: task.title.trim(), description: task.description, category: task.category, priority: task.priority, status: task.status, dueDate: task.dueDate, duration: task.duration, createdAt: task.createdAt, updatedAt: task.updatedAt, completedAt: task.completedAt };
  });
  const sessionIds = new Set();
  const sessions = data.sessions.map(session => {
    if (!session || typeof session.id !== 'string' || sessionIds.has(session.id) || !timestamp(session.completedAt) || session.minutes !== 25 || !(session.taskId === null || typeof session.taskId === 'string')) throw new Error('The file contains invalid focus history. No data was replaced.');
    sessionIds.add(session.id); return { id: session.id, taskId: session.taskId, completedAt: session.completedAt, minutes: 25 };
  });
  const p = data.preferences;
  if (!['light', 'dark'].includes(p.theme) || typeof p.name !== 'string' || p.name.length > 40 || typeof p.focus !== 'string' || p.focus.length > 140) throw new Error('The file contains invalid preferences.');
  return { version: 1, tasks, sessions, preferences: { theme: p.theme, name: p.name, focus: p.focus } };
}
export function loadState(storage) {
  try { const raw = storage.getItem(STORAGE_KEY); return { state: raw ? validateState(JSON.parse(raw)) : initialState(), error: null }; }
  catch { return { state: initialState(), error: 'Stored data could not be read. Your original storage has been preserved. Export or restore a valid backup in Settings.' }; }
}
export function parseQuick(input, now = new Date()) {
  const result = { title: '', priority: 'medium', category: '', dueDate: '', duration: null, warnings: [] };
  const used = new Set(); const title = [];
  for (const token of input.trim().split(/\s+/)) {
    let field, value; const lower = token.toLowerCase();
    if (lower === 'today' || lower === 'tomorrow') { field = 'dueDate'; value = lower === 'today' ? localDay(now) : dayOffset(1, now); }
    else if (/^#[\p{L}\p{N}_-]{1,50}$/u.test(token)) { field = 'category'; value = token.slice(1); }
    else if (/^!(high|medium|low)$/i.test(token)) { field = 'priority'; value = lower.slice(1); }
    else if (/^\d+(m|h)$/i.test(token) && Number.parseInt(token) > 0 && Number.parseInt(token) * (lower.endsWith('h') ? 60 : 1) <= 1440) { field = 'duration'; value = Number.parseInt(token) * (lower.endsWith('h') ? 60 : 1); }
    if (field && !used.has(field)) { used.add(field); result[field] = value; }
    else { title.push(token); if (field) result.warnings.push(`Multiple ${field === 'dueDate' ? 'date' : field} tokens: the extra token stays in the title. Review before saving.`); }
  }
  result.title = title.join(' '); return result;
}
export function makeTask(fields, now = new Date(), id = crypto.randomUUID()) {
  const title = fields.title.trim();
  if (!title || title.length > 200) throw new Error('Enter a title between 1 and 200 characters.');
  const time = now.toISOString();
  return { id, title, description: fields.description || '', category: fields.category || '', priority: fields.priority || 'medium', dueDate: fields.dueDate || '', duration: fields.duration || null, status: fields.status || 'todo', createdAt: time, updatedAt: time, completedAt: fields.status === 'done' ? time : null };
}
export function updateTask(task, fields, now = new Date()) {
  const status = fields.status ?? task.status;
  return { ...task, ...fields, title: (fields.title ?? task.title).trim(), updatedAt: now.toISOString(), completedAt: status === 'done' ? task.completedAt || now.toISOString() : null };
}
export function metrics(state, now = new Date()) {
  const today = localDay(now); const done = state.tasks.filter(t => t.status === 'done');
  const activity = Array.from({ length: 7 }, (_, i) => {
    const day = dayOffset(i - 6, now);
    return { day, count: done.filter(t => localDay(new Date(t.completedAt)) === day).length };
  });
  return { today: done.filter(t => localDay(new Date(t.completedAt)) === today).length, remaining: state.tasks.length - done.length, done: done.length, percentage: state.tasks.length ? Math.round(done.length / state.tasks.length * 100) : 0, sessions: state.sessions.length, activity };
}
export function visibleTasks(tasks, { view = 'all', search = '', priority = '', category = '', sort = 'priority' } = {}, now = new Date()) {
  const today = localDay(now);
  return tasks.filter(task => {
    const done = task.status === 'done';
    const included = view === 'completed' ? done : view === 'today' ? !done && (task.dueDate && task.dueDate <= today || task.priority === 'high' || task.status === 'progress') : view === 'upcoming' ? !done && task.dueDate > today : view === 'board' || view === 'all' ? true : !done;
    return included && (!priority || task.priority === priority) && (!category || task.category === category) && `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => {
    if (view === 'completed') return b.completedAt.localeCompare(a.completedAt);
    if (view === 'upcoming' || sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || priorities.indexOf(a.priority) - priorities.indexOf(b.priority);
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'title') return a.title.localeCompare(b.title);
    return Number(a.status === 'done') - Number(b.status === 'done') || priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
}
export function timerRemaining(timer, now = Date.now()) {
  return timer.running ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : timer.remaining;
}
