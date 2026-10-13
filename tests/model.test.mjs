import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, makeTask, updateTask, validateState, parseQuick, localDay, dayOffset, validDay, loadState, metrics, visibleTasks, timerRemaining } from '../model.js';
const now = new Date(2026, 9, 10, 14, 0, 0);
const task = (fields = {}, id = crypto.randomUUID()) => makeTask({ title: 'Write assignment', ...fields }, now, id);

test('local calendar dates, month boundaries, leap years and invalid dates', () => {
  assert.equal(localDay(now), '2026-10-10');
  assert.equal(dayOffset(1, new Date(2026, 11, 31, 23)), '2027-01-01');
  assert.equal(dayOffset(-1, new Date(2026, 0, 1, 0)), '2025-12-31');
  assert.equal(validDay('2024-02-29'), true);
  for (const value of ['2026-02-29', '2026-02-31', '2026-13-01', 'not a date']) assert.equal(validDay(value), false);
});
test('Quick Add parses the assignment example and hours', () => {
  assert.deepEqual(parseQuick('Finish assignment tomorrow #university !high 45m', now), { title: 'Finish assignment', dueDate: '2026-10-11', category: 'university', priority: 'high', duration: 45, warnings: [] });
  assert.equal(parseQuick('Read today 1h !low', now).duration, 60);
  assert.equal(parseQuick('Read TODAY 1H !LOW', now).dueDate, '2026-10-10');
  assert.equal(parseQuick('Read #研究', now).category, '研究');
});
test('ambiguous shorthand keeps extra tokens and requests review', () => {
  const result = parseQuick('Plan today tomorrow #home #work !high !low 25m 1h', now);
  assert.equal(result.title, 'Plan tomorrow #work !low 1h');
  assert.equal(result.warnings.length, 4);
  assert.equal(result.dueDate, '2026-10-10');
});
test('unrecognised tokens remain in title; no invented deadlines', () => {
  assert.equal(parseQuick('Investigate !urgent 0m 99h next-week', now).title, 'Investigate !urgent 0m 99h next-week');
  assert.equal(parseQuick('A normal task', now).dueDate, '');
  assert.equal(parseQuick('tomorrow !high 25m', now).title, '');
});
test('task creation rejects blank titles while allowing duplicates', () => {
  assert.throws(() => task({ title: '  ' }), /title/);
  const data = initialState(); data.tasks = [task({}, 'a'), task({}, 'b')];
  assert.equal(validateState(data).tasks.length, 2);
  assert.equal(data.tasks[0].createdAt, now.toISOString());
});
test('editing preserves identity and creation time; completion and reopen remain consistent', () => {
  const original = task({ description: 'Original', category: 'work', duration: 20 });
  const later = new Date(+now + 10000);
  const done = updateTask(original, { title: 'Revised', status: 'done' }, later);
  assert.equal(done.id, original.id); assert.equal(done.createdAt, original.createdAt); assert.equal(done.description, 'Original');
  assert.equal(done.completedAt, later.toISOString());
  const edited = updateTask(done, { description: 'Edited' }, new Date(+now + 20000));
  assert.equal(edited.completedAt, done.completedAt);
  assert.equal(updateTask(edited, { status: 'progress' }).completedAt, null);
});
test('Today, Upcoming, All, Completed and Board agree on underlying workflow', () => {
  const tasks = [task({ dueDate: '2026-10-09' }, 'overdue'), task({ dueDate: '2026-10-10' }, 'today'), task({ dueDate: '2026-10-12' }, 'future'), task({ priority: 'high' }, 'important'), task({ status: 'progress' }, 'active'), task({ status: 'done' }, 'done'), task({}, 'backlog')];
  assert.deepEqual(new Set(visibleTasks(tasks, { view: 'today' }, now).map(t => t.id)), new Set(['overdue', 'today', 'important', 'active']));
  assert.deepEqual(visibleTasks(tasks, { view: 'upcoming' }, now).map(t => t.id), ['future']);
  assert.equal(visibleTasks(tasks, { view: 'completed' }, now)[0].id, 'done');
  assert.equal(visibleTasks(tasks, { view: 'all' }, now).length, 7);
  assert.equal(visibleTasks(tasks, { view: 'board' }, now).length, 7);
});
test('search includes descriptions and projects; priority, category and sorting work together', () => {
  const tasks = [task({ title: 'Zebra', category: 'study', priority: 'high', dueDate: '2026-10-12' }, 'a'), task({ title: 'Alpha', description: 'research', priority: 'low', dueDate: '2026-10-11' }, 'b')];
  assert.equal(visibleTasks(tasks, { search: 'RESEARCH' }, now)[0].id, 'b');
  assert.equal(visibleTasks(tasks, { category: 'study', priority: 'high' }, now)[0].id, 'a');
  assert.equal(visibleTasks(tasks, { sort: 'due' }, now)[0].id, 'b');
  assert.equal(visibleTasks(tasks, { sort: 'title' }, now)[0].id, 'b');
});
test('activity comes only from completion timestamps; reopen and delete remove contributions', () => {
  const data = initialState();
  data.tasks = [task({ status: 'done' }), updateTask(task(), { status: 'done' }, new Date(2026, 9, 9, 12)), task()];
  data.sessions = [{ id: 'session', completedAt: now.toISOString(), minutes: 25, taskId: null }];
  const result = metrics(data, now);
  assert.equal(result.today, 1); assert.equal(result.done, 2); assert.equal(result.percentage, 67); assert.equal(result.remaining, 1); assert.equal(result.sessions, 1);
  assert.deepEqual(result.activity.map(day => day.count), [0, 0, 0, 0, 0, 1, 1]);
  data.tasks[0] = updateTask(data.tasks[0], { status: 'todo' });
  assert.equal(metrics(data, now).today, 0);
  data.tasks.splice(1, 1); assert.equal(metrics(data, now).done, 0);
});
test('empty insights contain no fabricated history', () => {
  const result = metrics(initialState(), now);
  assert.equal(result.percentage, 0); assert.equal(result.sessions, 0); assert.equal(result.activity.reduce((a, b) => a + b.count, 0), 0);
});
test('valid export round-trips; import rejects malformed schemas, duplicates, dates and timestamps', () => {
  const good = initialState(); good.tasks = [task()];
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(good))), good);
  for (const mutation of [d => { d.version = 2; }, d => { d.tasks[0].title = ''; }, d => { d.tasks.push(d.tasks[0]); }, d => { d.tasks[0].dueDate = '2026-02-31'; }, d => { d.tasks[0].duration = -1; }, d => { d.tasks[0].createdAt = 'x'; }, d => { d.tasks[0].status = 'done'; }, d => { d.preferences.theme = 'blue'; }, d => { d.sessions = [{ id: 'x', minutes: 5, taskId: null, completedAt: now.toISOString() }]; }]) {
    const copy = structuredClone(good); mutation(copy); assert.throws(() => validateState(copy));
  }
});
test('corrupt/missing/unavailable storage recovers without writing over original', () => {
  let writes = 0; const storage = { getItem: () => '{corrupted', setItem: () => { writes++; } };
  assert.equal(loadState(storage).state.tasks.length, 0); assert.ok(loadState(storage).error); assert.equal(writes, 0);
  assert.equal(loadState({ getItem: () => null }).error, null);
  assert.ok(loadState({ getItem() { throw new Error('Unavailable'); } }).error);
});
test('absolute timer deadlines handle suspension, pause and elapsed sessions', () => {
  const timer = { running: true, endsAt: 150000, remaining: 1500 };
  assert.equal(timerRemaining(timer, 0), 150); assert.equal(timerRemaining(timer, 149001), 1); assert.equal(timerRemaining(timer, 180000), 0);
  assert.equal(timerRemaining({ ...timer, running: false, remaining: 76 }, 999999), 76);
});
