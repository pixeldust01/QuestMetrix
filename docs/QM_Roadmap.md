# QuestMetrix — Project Roadmap v1.0

**Date:** 11 Aug 2026

**Technical Design Document:** [QuestMetrix_TDD_v0.2.md](QuestMetrix_TDD_v0.2.md)

**Pace assumption:** 8–14 hrs/week (evenings + weekends)
**Planning horizon:** ~21 weeks

---

## 0. How to use this roadmap

- Every phase is broken into **weeks**, and every week has **sub-tasks with a deadline** (the Sunday that closes that week).
- Time estimates already include a buffer for debugging, re-learning concepts, and life getting in the way — that's why the totals are rounded _up_, not down.
- If you skip a week, don't panic and don't try to "catch up" by cramming — just slide every remaining date forward by however many weeks you missed. The plan is a ruler, not a whip.
- Each phase ends with a **Definition of Done** — the same style you already used for Milestone 1. Don't call a phase finished until every box is checked.
- Treat this file as `docs/ROADMAP.md` in your repo. Update the checkboxes as you go — that log becomes proof of progress for your portfolio.

---

## 1. Milestone Timeline (at a glance)

| #   | Milestone                   | Phase   | Planned Start   | Deadline               | Actual Finish Date |
| --- | --------------------------- | ------- | --------------- | ---------------------- | ------------------ |
| 1   | Basic Telemetry Backend     | Phase 1 | —               | **DONE (11 Aug 2026)** | 11 Aug 2026        |
| 2   | Godot SDK Integration       | Phase 2 | Mon 17 Aug 2026 | **Sun 06 Sep 2026**    | 11 Aug 2026        |
| 3   | Analytics Layer             | Phase 3 | Mon 07 Sep 2026 | **Sun 27 Sep 2026**    | 13 Aug 2026        |
| 4   | Analytics Dashboard (React) | Phase 4 | Mon 28 Sep 2026 | **Sun 18 Oct 2026**    | 15 Aug 2026        |
| 5   | Scalable Infrastructure     | Phase 5 | Mon 19 Oct 2026 | **Sun 15 Nov 2026**    | -                  |
| 6   | Real-Time + Session Replay  | Phase 6 | Mon 16 Nov 2026 | **Sun 13 Dec 2026**    | -                  |
| 7   | Engineering Hardening       | Phase 7 | Mon 14 Dec 2026 | **Sun 10 Jan 2027**    | -                  |

**Project v1.0 target completion: Sunday, 10 January 2027** (~5 months from today).

This is deliberately conservative. If my pace is closer to 14 hrs/week consistently, I'll likely finish 3–4 weeks early — treat that as slack, not a reason to add scope.

---

## 2. Milestone 1 — Basic Telemetry Backend ✅ COMPLETE

Already done as of 11 Aug 2026. For the record, this is what "done" looked like — use this as your template for judging future milestones:

- [x] FastAPI server runs, root endpoint responds
- [x] PostgreSQL installed, `questmetrix` DB + `events` table created
- [x] Event schema defined, validated via Pydantic
- [x] `POST /events` inserts into PostgreSQL
- [x] `GET /events` retrieves stored events
- [x] Verified with multiple events

---

## 3. Milestone 2 — Godot SDK Integration ✅ COMPLETE

**Goal:** Replace manual Swagger testing with a real Godot game sending a real event through the SDK.

### Week 1 — Deadline: Sun 23 Aug 2026

- [x] Install Godot, create a throwaway test project (`sdk-test/`)
- [x] Learn `HTTPRequest` node basics in GDScript (how async requests work in Godot)
- [x] Manually fire one `HTTPRequest` from a test script to your existing `POST /events` and confirm it lands in PostgreSQL
- **Definition of done for the week:** one raw HTTP call from Godot successfully inserts a row.

### Week 2 — Deadline: Sun 30 Aug 2026

- [x] Create `sdk/` folder contents: a `QuestMetrix.gd` autoload/singleton script
- [x] Implement `QuestMetrix.track(event_name, extra_data={})` that builds the JSON payload and POSTs it
- [x] Add basic config (API base URL, `game_id`, `player_id`) so it's not hardcoded per call
- **Definition of done for the week:** `QuestMetrix.track("enemy_killed")` works from any script in the test project.

### Week 3 — Deadline: Sun 06 Sep 2026

- [x] Add error handling — what happens if the backend is down or unreachable? (log it, don't crash the game)
- [x] Add a short `sdk/README.md` explaining how to drop the SDK into a Godot project
- [x] Update main repo `README.md`: move "Godot SDK" from Planned → Implemented (partial)
- [x] Commit: `feat: add Godot telemetry SDK`, `feat: send events from Godot`

### Milestone 2 — Definition of Done

- [x] A Godot test project can call `QuestMetrix.track("enemy_killed")`
- [x] The event appears in PostgreSQL without touching Swagger
- [x] SDK handles a dropped connection without crashing the game
- [x] SDK usage documented

### Watch out for

- Godot's `HTTPRequest` is **async** — results arrive via a signal, not a return value. This trips up almost everyone the first time.
- Don't over-engineer the SDK yet (no retries, no offline queueing). That's Phase 5/7 territory.

---

## 4. Milestone 3 — Analytics Layer ✅ COMPLETE

**Goal:** Turn raw events into aggregated, queryable statistics — no dashboard yet, just API endpoints returning numbers.
**Window:** Mon 07 Sep – Sun 27 Sep 2026 (3 weeks, ~30 hrs total)

### Week 1 — Deadline: Sun 13 Sep 2026

- [x] Write raw SQL (or SQLAlchemy, if you introduce it here) for: event counts by type, by game, by level
- [x] Build `GET /games` — list distinct games with basic event totals
- [x] Build `GET /players` — list distinct players with basic event totals
- **Definition of done for the week:** both endpoints return real aggregated numbers from your test data.

### Week 2 — Deadline: Sun 20 Sep 2026

- [x] Build level statistics: completion rate, average deaths per level, average time-to-complete (needs `level_completed` + `player_died` events with timestamps)
- [x] Generate more realistic mock event data (a small Python script that inserts a batch of varied test events) so your aggregates aren't trivial
- **Definition of done for the week:** you can answer "how many players died on Level 3?" via an API call.

### Week 3 — Deadline: Sun 27 Sep 2026

- [x] Define a **session** conceptually (e.g., events from the same `player_id` within a gap-free time window) and implement basic session grouping. Here, keeping gap-time as 30 minutes.
- [x] Add a first-pass retention stat (e.g., did a player return with events on a later calendar day?)
- [x] Commit: `feat: add analytics aggregation`
- [x] Update README: Planned → Implemented for player/level/session analytics

### Milestone 3 — Definition of Done

- [x] `GET /games`, `GET /players` return real aggregates
- [x] Level-level stats (completion rate, deaths, avg time) work
- [x] Sessions can be identified from raw events
- [x] A basic retention number can be computed

### Watch out for

- Session boundaries are a genuinely hard problem — don't chase perfection. A simple "30-minute gap = new session" rule is a fine v1.
- This phase is SQL-heavy. If you're not comfortable with `GROUP BY` / `JOIN` yet, budget extra time in Week 1 — it's worth understanding, not just copy-pasting.

---

## 5. Milestone 4 — Analytics Dashboard (React) ✅ COMPLETE

**Goal:** A React app that visualizes what Phase 3 computes — the first time non-technical eyes could look at QuestMetrix and understand it.
**Window:** Mon 28 Sep – Sun 18 Oct 2026 (3 weeks, ~28 hrs total)

### Week 1 — Deadline: Sun 04 Oct 2026

- [x] Scaffold the React app inside `dashboard/` (Vite recommended for a lighter setup than CRA)
- [x] Build a raw event table view: fetch `GET /events`, render as a table
- [x] Confirm CORS is configured on the FastAPI side so the dashboard can actually call it

### Week 2 — Deadline: Sun 11 Oct 2026

- [x] Build summary cards: total events, unique players, unique games
- [x] Wire cards to the Phase 3 endpoints (`/games`, `/players`)
- [x] Basic layout/styling pass — doesn't need to be beautiful, needs to be legible

### Week 3 — Deadline: Sun 18 Oct 2026

- [x] Add charts (recharts is a reasonable first choice): events-over-time, level completion rates
- [x] Handle loading and error states (what shows while data is fetching, what shows if the API is down)
- [x] Commit: `feat: create analytics dashboard`
- [x] Update README: Planned → Implemented for dashboard

### Milestone 4 — Definition of Done

- [x] Dashboard runs locally and fetches live data from FastAPI
- [x] Raw events, summary stats, and at least 2 charts are visible
- [x] Loading/error states don't show a blank white screen

### Watch out for

- This is your first frontend-meets-backend integration in this project — CORS errors are almost guaranteed the first time. Don't burn hours guessing; the browser console will tell you exactly what's blocked.
- Resist the urge to make this "portfolio-pretty" yet. Functional first — Phase 7 hardening is a better time to polish.

---

## 6. Milestone 5 — Scalable Infrastructure

**Goal:** Move from "one request, one DB write" to a decoupled, cache-backed, authenticated pipeline. This is the most conceptually dense phase — budget the extra week deliberately.
**Window:** Mon 19 Oct – Sun 15 Nov 2026 (4 weeks, ~38 hrs total)

### Week 1 — Deadline: Sun 25 Oct 2026

- [x] Install Redis locally, connect from Python (`redis-py`)
- [x] Add a caching layer for one expensive read (e.g., cache `GET /games` aggregates for 60s)
- [x] Verify cache invalidation logic — this is the part people get wrong, don't skip testing it

### Week 2 — Deadline: Sun 01 Nov 2026

- [x] Introduce a message queue (Redis Streams is the lowest-friction option since Redis is already installed; RabbitMQ if you want the "real" message-broker experience)
- [x] Change `POST /events` so it pushes to the queue instead of writing directly to PostgreSQL

### Week 3 — Deadline: Sun 08 Nov 2026

- [x] Build a background worker process that reads from the queue and writes to PostgreSQL
- [x] Test the full async path: SDK → API → queue → worker → DB, and confirm no events are lost if the worker briefly restarts

### Week 4 — Deadline: Sun 15 Nov 2026

- [x] Add basic rate limiting on `POST /events`
- [x] Add API key authentication (a `game_id` ↔ API key mapping is enough for v1 — no need for full OAuth)
- [x] Commit: `feat: add Redis caching`, `feat: add asynchronous event processing`
- [x] Update README: Planned → Implemented for Redis, queue, workers, rate limiting, auth

### Milestone 5 — Definition of Done

- [x] Events flow through a queue + worker, not a direct insert
- [x] At least one endpoint is cache-backed with correct invalidation
- [x] `POST /events` requires a valid API key
- [x] Basic rate limiting rejects excessive requests

### Watch out for

- This phase changes your core data flow. Before starting, re-read your own "Core Data Flow to Remember" section and consciously redraw it with the queue inserted — that diagram will drift if you don't update it deliberately.
- Async systems fail silently more often than they crash loudly. Add logging _before_ you need it, not after something goes missing.

---

## 7. Milestone 6 — Real-Time + Session Replay

**Goal:** Live-updating dashboard via WebSockets, plus your differentiating feature — session/replay visualization.
**Window:** Mon 16 Nov – Sun 13 Dec 2026 (4 weeks, ~33 hrs total)

### Week 1 — Deadline: Sun 22 Nov 2026

- [x] Learn WebSocket basics in FastAPI
- [x] Build a WebSocket endpoint that broadcasts new events as they're processed by the worker

### Week 2 — Deadline: Sun 29 Nov 2026

- [x] Connect the React dashboard to the WebSocket
- [x] Make at least one chart or the raw event table update live without a page refresh

### Week 3 — Deadline: Sun 06 Dec 2026

- [ ] Design the session/replay data model (ordered event sequence per session, as sketched in your docs: START LEVEL → MOVE → COLLECT ITEM → FIGHT ENEMY → …)
- [ ] Build an API endpoint that returns a single session as an ordered timeline

### Week 4 — Deadline: Sun 13 Dec 2026

- [ ] Build a session timeline view in the dashboard (a simple vertical/horizontal event list is a fine v1 — don't aim for a full replay player yet)
- [ ] Commit: `feat: add real-time updates`, `feat: add session replay visualization`
- [ ] Update README: Planned → Implemented for WebSockets, session/replay

### Milestone 6 — Definition of Done

- [ ] Dashboard updates in real time when a new event is sent
- [ ] A specific player session can be viewed as an ordered timeline of events

### Watch out for

- This is the feature that differentiates QuestMetrix from a generic CRUD app — worth doing well, but "well" means clear and correct, not visually elaborate. A clean ordered list is a legitimate v1.

---

## 8. Milestone 7 — Engineering Hardening

**Goal:** Turn a working prototype into something you'd be comfortable calling production-adjacent — tests, observability, containerization, CI/CD, load testing.
**Window:** Mon 14 Dec 2026 – Sun 10 Jan 2027 (4 weeks, ~37 hrs total)

### Week 1 — Deadline: Sun 20 Dec 2026

- [ ] Write unit tests for backend logic (validation, aggregation functions) using `pytest`
- [ ] Write integration tests that hit a real (test) database

### Week 2 — Deadline: Sun 27 Dec 2026

- [ ] Add structured logging across the API and worker
- [ ] Add basic metrics/observability (even a simple `/health` + request-count endpoint counts as a start)

### Week 3 — Deadline: Sun 03 Jan 2027

- [x] Dockerize the backend and database with `docker-compose` (one command should bring up the full stack)
- [ ] Set up CI with GitHub Actions: run tests + lint on every push

### Week 4 — Deadline: Sun 10 Jan 2027

- [ ] Run a basic load test (Locust or k6) against `POST /events` and record the results
- [ ] Final documentation pass: README, architecture diagram, and an honest "what's implemented vs. planned" section
- [ ] Commit: `feat: add tests`, `feat: containerize backend`, `feat: add CI pipeline`, `docs: finalize v1.0 documentation`

### Milestone 7 — Definition of Done

- [x] `docker-compose up` brings up the full working stack from a clean clone
- [ ] Tests run automatically on push via CI
- [ ] Load test results are recorded somewhere in `docs/`
- [ ] README accurately reflects what's built — no features described as done that aren't

**This is your v1.0.** Everything past this point (deeper analytics, multi-game support, more SDKs) is v1.1+ and deserves its own future roadmap.

---

## 9. Things to track continuously (not tied to one phase)

- **Secrets hygiene:** every phase that touches config (API keys in Phase 5, DB creds already) — recheck `.gitignore` is still excluding `.env` before every commit. One leaked credential undoes a lot of good work.
- **README accuracy:** you already built the "Implemented vs. Planned" separation into your README — keep updating it at the end of _every_ milestone, not just at the end of the project. This is also what makes your Git history readable to anyone reviewing the repo later.
- **The 4-question framework:** for every new technology (Redis, message queues, WebSockets, Docker, CI/CD) keep applying your own rule — _What is it? Why do we need it? Where does it sit? What problem does it solve?_ This is what turns "I copy-pasted a tutorial" into "I understand my own system," which matters a lot if this project comes up in an interview.
- **Commit discipline:** one meaningful commit per completed sub-task, not one giant commit per phase. Your commit history is effectively a second resume.
- **Scope creep:** the biggest risk to a 5-month solo project is not technical difficulty, it's adding "just one more feature" mid-phase. If an idea comes up outside the current phase, write it in a `docs/BACKLOG.md` and keep moving — don't context-switch.
- **Buffer usage:** each phase's estimate already has slack built in. If you finish a week early, don't pull the next phase forward — bank it. Life happens, and the buffer's job is to absorb that, not to be spent on scope creep.

---

## 10. If pace changes

- **Faster (14+ hrs/week consistently):** compress each phase's _week count_ by roughly 25%, but keep every sub-task — don't skip steps, just shorten the calendar around them.
- **Slower (under 8 hrs/week):** don't panic-compress. Recompute from today's date using the same week-counts per phase; a 5-month project sliding to 7 months is a normal outcome for a solo learning project done alongside other commitments.
- **Stuck on something for more than ~1.5x its budgeted time:** that's a signal to simplify the sub-task (ship a rougher v1) rather than keep pushing — you can always revisit and improve after the phase is closed out.
