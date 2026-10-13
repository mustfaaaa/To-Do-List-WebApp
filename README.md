# FLOWSTATE

A focused productivity workspace built with vanilla HTML, CSS, and JavaScript. Its light and dark themes use a forest-green, midnight-navy, and electric-lime design system inspired by the supplied visual reference. No runtime dependencies, authentication, cloud services, external fonts, or API keys. The first launch is an honest empty workspace.

## Run

Install **Node.js 20 or newer**, then run:

```sh
npm run dev
```

Open **http://localhost:5173**. No `npm install` is needed. Keep using the same hostname and port because browser storage belongs to an origin. `localhost` and `127.0.0.1` have separate data.

```sh
npm test          # Node's built-in test runner
npm run lint     # JS syntax and duplicate HTML ID checks
npm run build    # Copies production assets to dist/
node scripts/server.mjs --dist  # Serve the production build
```

Deploy `dist/` to any static web host. Open through HTTP rather than double-clicking `index.html`, since the application uses JavaScript modules. Set the `PORT` environment variable to use another port (PowerShell: `$env:PORT='5174'; npm run dev`).

## Feature guide

- Create and edit tasks with descriptions, priorities, projects, due dates, estimates, and workflow states. Duplicate titles are allowed. Complete/reopen tasks; deletion offers a 12-second undo, extended while hovering or focusing the notification.
- **Today** includes overdue tasks, tasks due today, high-priority tasks, and work in progress. **Upcoming** groups unfinished future tasks by date. **All tasks** includes the full collection and an All / Active / Completed status control. **Completed** sorts by completion time. **Board** has accessible workflow dropdowns in place of drag-and-drop.
- Search titles, descriptions, and projects. Combine priority/project filters and sort by priority, deadline, creation time, or title. Filters carry across views until cleared.
- **Quick Add:** `Finish assignment tomorrow #university !high 45m`. Supports `today`, `tomorrow`, `#project`, `!high`, `!medium`, `!low`, and positive whole-minute/hour tokens up to 24 hours. Every submission opens a populated review form before saving. Conflicting tokens stay in the title with a warning; unrecognised tokens remain literal text. No deadline is assumed when none is entered.
- **Focus:** choose a task or use open focus; start, pause, resume, reset; 25-minute focus, 5-minute short break, and 15-minute long break presets. A dedicated full-screen studio keeps the timer and current task in view. Switching a running/paused preset or a paused task asks before resetting the session. Completing a focus session records history; it does not automatically complete the task. Breaks don't count as focus sessions.
- **Insights:** completed today, remaining tasks, overall completion percentage, seven local-calendar days of task completion, focus session count, and real completion milestones. Reopening or deleting a task removes its completion contribution. Focus history remains independent of task deletion.
- **Settings & data:** personalize your greeting and daily intention, export JSON, or validate and import a backup. Imports explicitly confirm replacement. Mobile Settings is available from the top bar, and the theme can be switched inside Settings or through the command menu.
- Light and dark themes use persistent preferences. Native dialogs manage keyboard focus, with explicit focus restoration, Escape handling, and visible focus indicators. System reduced-motion preferences disable animation and transitions.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `N` | Create a task |
| `/` | Focus task search |
| `Ctrl+K` / `Cmd+K` | Open command menu |
| `↑` / `↓`, then `Enter` | Choose a command |
| `Escape` | Close the active dialog |

Global shortcuts are ignored inside inputs, textareas, selects, editable content, and active dialogs. `Tab` and `Shift+Tab` navigate controls and stay within modal dialogs.

## Persistence and integrity

Versioned data lives in `flowstate.v1` in **localStorage**. Tasks carry creation, update, and completion timestamps. Dates use local calendar days rather than UTC date slicing. The timer uses an absolute deadline and a single clock, persists separately in `flowstate.timer.v1`, and checks expiration on visibility changes and reloads. A recovered expired focus session is counted once by its session ID.

localStorage is **browser-specific, origin-specific, and not cloud backup**. Clearing site data removes it. Export JSON regularly. Imports validate all task fields, unique IDs, dates, durations, timestamps, workflow consistency, preferences, and focus history before asking to replace data. Files above 10 MB are rejected. Corrupted data never crashes the app or gets overwritten automatically. Starting fresh retains the unreadable source in `flowstate.recovery`. Storage failures leave work available in the current tab and show a backup reminder.

Use one tab for editing. Other tabs receive saved changes when no dialog is open; simultaneous editing is not a transactional collaboration system. A running browser timer cannot send notifications while the browser is closed; elapsed sessions are reconciled on reopening.

## Project structure

| File | Responsibility |
| --- | --- |
| `index.html` | Semantic workspace, forms, and dialogs |
| `styles.css` | Design tokens, themes, responsive layouts, and motion |
| `model.js` | Task operations, parsing, local dates, schema validation, metrics, and view selection |
| `app.js` | Rendering, interaction, persistence, timer, commands, and import/export |
| `scripts/` | Dependency-free development server, production build, and checks |
| `tests/` | Automated model tests and isolated browser QA fixtures |

## Verification performed

For the forest-and-lime redesign, `npm run lint`, `npm test` (13 passing model tests), and `npm run build` passed. A headless browser rendered the local application source and both themes. Browser checks covered Quick Add, the All / Active / Completed control, task completion and Board consistency, theme switching and persistence, command-menu access to Focus, mobile task and Focus dialogs, and console/request errors. Board widths of 1440, 1280, 1024, 768, 390, and 320px had no document-level horizontal overflow; both light and dark layouts were visually inspected. The prior task workflows below were verified before this visual redesign and remain backed by the unchanged task model.

`npm test`: 13 tests passed. Coverage includes valid/conflicting/unknown shorthand, empty titles, duplicates, task timestamps, completion/reopening, all views, combined filters/sorting, local dates and leap years, real metrics, invalid schemas, corrupted/unavailable storage, export round-trips, and absolute timer deadlines. `npm run lint` and `npm run build` passed. The HTTP server returned successful responses for the application and its assets.

Browser workflows tested using the Codex in-app browser:

- Create, refresh persistence, edit every field, complete, reopen, delete, undo, and metric updates.
- Upcoming grouping, overdue labels, search, combined filters, alphabetical sorting, view switching, and Board workflow changes.
- Task-linked focus, start/pause/resume/reset, both break presets, and in-app preset-reset confirmation.
- Completed focus history and no duplication after refresh, using a persisted timer fixture with two seconds remaining (simulated elapsed time, not a 25-minute wall-clock run).
- Dark theme persistence, personalization, JSON download, re-import confirmation/restoration, and invalid import rejection without replacing data.
- Corrupted storage, preserved recovery data, and confirmed fresh start in an isolated browser origin.
- `N`, `/`, `Ctrl+K`, command selection, Escape, blank-title errors, and shortcuts remaining inert during text entry.
- Desktop, tablet (768px), and mobile (375px and 320px) viewports: no horizontal document overflow; mobile Board and task dialog fit were checked. Light/dark layouts were inspected visually. Short laptop-height navigation was corrected during testing.
- Captured browser error/warning logs were empty on tested workflows. The application makes no external asset requests.

System reduced-motion CSS was inspected; OS preference emulation, full screen-reader testing, physical touch-device testing, and a full 25-minute wall-clock run were not performed. No ambient sound or fabricated activity is included.

To reproduce recovery/expiration QA, start a server on a separate port and visit `/tests/browser-fixture.html`. **Its buttons overwrite disposable test data on that origin.** Fixtures are excluded from the production build. `tests/invalid-import.json` is a deliberately malformed import fixture.
