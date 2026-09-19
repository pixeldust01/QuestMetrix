# Technical Design Document (TDD): QuestMetrix

**Version:** v0.22
**Date:** 24 Aug 2026  
**Status:** Living document — update as milestones close

---

## 1. Overview

### 1.1 Executive Summary

QuestMetrix is a telemetry and analytics platform designed for game developers. It provides infrastructure to receive, store, process, and visualize gameplay events.

The platform's core purpose is to collect structured gameplay events from games and transform those raw events into useful developer-facing analytics such as player progression, level completion, deaths, session behaviour, and player drop-off.

The intended end-to-end flow is:

```text
Game
  ↓
QuestMetrix SDK
  ↓
Event API
  ↓
Message Queue
  ↓
Processing Workers
  ↓
Database / Cache
  ↓
Analytics API
  ↓
Analytics Dashboard
```

As of this revision, the implementation covers the API, database, SDK, analytics layer, dashboard, and the asynchronous queue/worker pipeline (§1.2). The project is being developed incrementally so that each architectural component is understood, tested, and stabilized before the next component is introduced.

### 1.2 Current Implementation Status

Milestones 1 through 4 are complete, and Milestone 5 (Scalable Infrastructure) is in progress — the asynchronous pipeline (queue + worker) is live, and rate limiting/authentication are the remaining open items:

```text
Godot SDK / Client
       ↓
   FastAPI API
       ↓
Pydantic validation
       ↓
Redis Streams (queue)
       ↓
  worker.py
       ↓
   PostgreSQL
       ↓
   events table
       ↓
Analytics API (games / players / levels)
       ↓
Redis cache (60s TTL)
       ↓
React Dashboard
```

Currently implemented:

- FastAPI backend
- PostgreSQL 18 database
- `questmetrix` database
- `events` table
- Pydantic event validation
- `POST /events` (now publishes to the queue rather than writing directly — see §3.1 and §6.3)
- `GET /events`, `GET /games`, `GET /players`, `GET /levels`
- environment-based database configuration
- manual API verification through FastAPI Swagger/OpenAPI documentation
- Godot SDK for event submission (`QuestMetrix.gd`, with error handling and its own README)
- Session grouping (30-minute inactivity window) and a basic daily retention metric
- React analytics dashboard (`dashboard/`): raw event table, summary stat cards, charts, loading/error states
- Redis caching (60-second TTL on `GET /games`, with tested hit/expiry/invalidation behavior)
- Redis Streams as the message queue between the API and the background worker
- A background worker (`worker.py`) that consumes the queue and persists events to PostgreSQL, using structured `logging.info()` calls (captured by `docker logs`)
- Full Docker Compose containerization: FastAPI, PostgreSQL (with a persistent volume), Redis, and the worker all run and communicate via internal service names, brought up with a single `docker-compose up -d --build`
- A restructured automated test suite (`unit/`, `integration/`, `e2e/`) run through a dedicated `test-runner` Docker Compose service/profile

Authentication, rate limiting, WebSockets, session/replay visualization, CI/CD, load testing, and full monitoring/alerting are still planned rather than implemented.

---

## 2. Goals & Scope

### 2.1 Development Philosophy

QuestMetrix follows an iterative development model.

The project is intentionally built from a small working pipeline toward a more distributed architecture:

```text
Working ingestion
      ↓
Persistent storage
      ↓
Game SDK
      ↓
Analytics
      ↓
Dashboard
      ↓
Asynchronous processing
      ↓
Scalability and operational hardening
```

The project should not adopt complex infrastructure before the simpler version is understood and verified.

### 2.2 Completed Scope

#### Milestone 1

- A working FastAPI + PostgreSQL backend.
- A defined telemetry event structure.
- Pydantic validation for incoming events.
- `POST /events` for event ingestion and persistence.
- `GET /events` for event retrieval.
- Multiple events can be stored and retrieved.
- Manual API verification through Swagger/OpenAPI.
- Database verification through SQL queries.

#### Milestone 2

- A Godot SDK (`QuestMetrix.gd`) that can send events to the backend.
- The SDK's `track(event_name, extra_data={})` function builds and POSTs the event payload.
- The SDK is configurable (API URL, game ID, player ID).
- The SDK handles connection errors gracefully without crashing the game.
- The SDK is documented with a `README.md`.

#### Milestone 3 — Analytics Layer

- SQL aggregations exposed via `GET /games` and `GET /players`.
- `GET /levels` for completion rate, average deaths, and average completion time per level.
- Session grouping using a 30-minute inactivity window.
- A basic daily retention metric (whether a player returned on a later calendar day).
- Realistic multi-player/multi-level mock telemetry generated to validate the aggregations against non-trivial data.
- Backend refactored into `main.py`, `events.py`, `analytics.py`, and `database.py` to keep the growing endpoint surface organized.

#### Milestone 4 — Dashboard

- A React application in `dashboard/` that connects to the FastAPI backend.
- A raw event table, summary statistic cards, and charts (events over time, level completion rates).
- Loading and error states are handled in the UI rather than showing a blank screen.

#### Milestone 5 — Scalable Infrastructure

- Redis installed and connected; `GET /games` cached for 60 seconds, with cache hit/expiry/manual-invalidation behavior tested.
- The full stack (FastAPI, PostgreSQL with a persistent volume, Redis) containerized and orchestrated with Docker Compose, communicating via internal service names, and runnable end-to-end with one command.
- A message queue implemented using Redis Streams (see §4.2 for the decision update — this superseded the earlier RabbitMQ candidate).
- `POST /events` changed to publish to the queue instead of writing directly to PostgreSQL.
- A background worker (`worker.py`) that consumes the queue and writes to PostgreSQL, with `logging.info()` output captured by `docker logs`.
- An expanded, restructured automated test suite (`unit/`, `integration/`, `e2e/`) with a dedicated `test-runner` Docker Compose service — originally scoped for Phase 7, pulled forward because the async pipeline needed a reliable way to verify it.
- Rate limiting on `POST /events`.
- API key authentication.
- Confirmed no events are lost if the worker restarts mid-processing.
- The worker is wired to update/invalidate Redis cache entries after a successful write.

#### Milestone 6 — Real-Time + Session Replay

- 

### 2.3 Planned Scope

#### Scalable Infrastructure (remaining)

- CI/CD
- Full monitoring and alerting (structured JSON logging currently exists only in `worker.py`, via plain `logging.info()` calls — not yet the structured format described in §9.1)

#### Advanced Session / Replay Analysis

The system may preserve ordered event sequences so that a developer can inspect a player's gameplay path:

```text
START LEVEL
    ↓
MOVE
    ↓
COLLECT ITEM
    ↓
FIGHT ENEMY
    ↓
LOSE HP
    ↓
DIE
```

#### Engineering Hardening

The project will eventually include:

- automated tests
- structured logging
- monitoring
- error recovery
- database migrations
- load testing
- deployment documentation
- troubleshooting documentation
- rollback procedures

### 2.4 Non-Goals

QuestMetrix is not a game.

It is infrastructure used by games to collect and analyze gameplay telemetry.

The project is also not intended to become a full commercial-scale analytics service. The target is a technically credible, demonstrable platform that shows sound software engineering and systems design.

---

## 3. System Architecture

### 3.1 Current Architecture

As of Milestone 5, the architecture is a decoupled, asynchronous pipeline protected by rate limiting and API key authentication:

```text
Game/SDK
    ↓
+--------------------+
| FastAPI            |
| - Rate limiting    |
| - API key auth     |
+--------------------+
    ↓
Redis Stream (queue)
    ↓
Worker (worker.py)
    ↓
PostgreSQL
```

`POST /events` no longer writes to PostgreSQL directly. It publishes the validated event onto a Redis Stream. A separate background worker (`worker.py`) consumes that stream and performs the database write. The entire stack (FastAPI, PostgreSQL, Redis, and the worker) runs under Docker Compose and communicates via internal service names.

The worker is also responsible for invalidating the Redis cache after a successful database write, ensuring data consistency between the cache and the primary database.

For reference, the original Milestone 1–2 baseline (before the queue existed) was a direct write:

```text
Godot SDK / Client → FastAPI → Pydantic validation → PostgreSQL → questmetrix.events
```

That simpler design was intentional at the time — a stable baseline to validate before asynchronous processing was introduced.

### 3.2 Target Architecture

The planned architecture is:

```text
                         GAME
                           │
                           ▼
                  QuestMetrix SDK
                           │
                           ▼
                       Event API
                           │
                           ▼
                    Message Queue
                           │
                           ▼
                 Processing Workers
                    │           │
                    │           └──────► Redis
                    │
                    ▼
                 PostgreSQL
                    │
                    ▼
              Analytics API Layer
                    │
                    ├──────────────► WebSocket
                    │
                    ▼
               React Dashboard
```

The message queue separates event ingestion from downstream processing. Workers can process events independently of the API request.

Redis will be considered for frequently accessed analytics, session lookups, and other data where low-latency access provides a measurable benefit.

**Status update:** the SDK, Event API, Message Queue, Processing Worker, PostgreSQL, Redis (caching), and Analytics API Layer boxes above are now implemented (see §3.1). The remaining gap between this diagram and reality is narrower than it was at v0.2: WebSocket delivery to the dashboard is still not built, and the pipeline isn't yet gated by authentication or rate limiting.

### 3.3 Architectural Principle

Each target component will be introduced only after the preceding component is functional and understood.

This avoids a "big bang" implementation and makes failures easier to isolate.

### 3.4 Current-to-Target Migration Path

```text
Milestone 1 & 2 ✅ Complete
Godot SDK → FastAPI → PostgreSQL

        ↓

Milestone 3 ✅ Complete
Events → Analytics processing (games/players/levels, sessions, retention) → PostgreSQL

        ↓

Milestone 4 ✅ Complete
Analytics API → React Dashboard

        ↓

Milestone 5 ✅ Complete
Redis caching → Docker containerization → Redis Streams queue → Worker → PostgreSQL → Rate limiting, API authentication, worker↔cache integration


        ↓

Milestone 6 ⏳ Planned
WebSockets + session/replay analysis

        ↓

Milestone 7 ⏳ Planned
CI/CD + full observability + load testing
(automated tests and Docker support were pulled forward into Milestone 5 —
see §2.2 — because the async pipeline needed them earlier than originally scoped)
```

### 3.5 Sequence Flow — Event Ingestion

```text
Game
  │
  │ QuestMetrix.track(...)
  ▼
SDK
  │
  │ HTTP POST /events
  ▼
API                                          ✅ implemented
  │
  │ validate payload
  ▼
Message Queue (Redis Streams)                ✅ implemented
  │
  │ acknowledge / persist message
  ▼
Worker (worker.py)                           ✅ implemented
  │
  │ process event, write to PostgreSQL
  ▼
PostgreSQL
  │
  ├────────► Redis/cache                     ⏳ not yet wired (worker doesn't
  │                                              update the cache after a write)
  ▼
Analytics API                                ✅ implemented (games/players/levels)
  │
  ▼
Dashboard                                    ✅ implemented (polls the API;
                                                 no live push yet — see §3.2)
```

### 3.6 Testing Architecture

The project employs a multi-layered testing strategy, organized as follows:

```
tests/
├── unit/
├── integration/
└── e2e/
```

- **Unit Tests (`/unit`):** These tests focus on individual components in isolation. They use mocking to avoid external dependencies like databases or APIs.
- **Integration Tests (`/integration`):** These tests verify the interaction between different components of the system, such as the API and the database.
- **End-to-End (E2E) Tests (`/e2e`):** These tests validate the entire application flow, from the client (SDK) to the database.

## Integration and E2E tests are run against a containerized environment using a dedicated `test-runner` service in Docker Compose. This ensures that tests are executed in a clean, consistent, and isolated environment that mirrors the production setup.

## 4. Technology Stack

### 4.1 Currently Used

| Component         | Technology                             | Role                              | Reason                                                                                                                            |
| ----------------- | -------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Language          | Python                                 | Backend programming language      | Familiar, readable, and suitable for rapid backend development                                                                    |
| API framework     | FastAPI                                | HTTP API and routing              | Provides typed request validation and automatic OpenAPI documentation                                                             |
| Validation        | Pydantic                               | Event data contracts              | Integrates directly with FastAPI and validates structured payloads                                                                |
| Database          | PostgreSQL 18                          | Persistent event storage          | Relational, mature, structured, and suitable for querying telemetry data                                                          |
| DB driver         | psycopg2-binary                        | Python → PostgreSQL communication | Provides PostgreSQL connectivity from Python                                                                                      |
| Config loader     | python-dotenv                          | Environment configuration         | Keeps database credentials outside source code                                                                                    |
| API testing       | FastAPI Swagger/OpenAPI docs           | Manual API testing                | Allows endpoints to be tested without a separate frontend                                                                         |
| Version control   | Git                                    | Source/version tracking           | Provides local history and reproducible development checkpoints                                                                   |
| Remote repository | GitHub                                 | Hosted repository                 | Stores project history and supports collaboration/review                                                                          |
| Game SDK          | Godot / GDScript                       | Game-side telemetry client        | Fits the project's game-development focus and existing Godot usage                                                                |
| Dashboard         | React                                  | Analytics UI                      | Provides a component-based frontend for data visualization                                                                        |
| Cache             | Redis                                  | Fast-access data                  | Redis is used as its in-memory data structures are suitable for frequently accessed metrics, session lookups, and real-time views |
| Containerization  | Docker                                 | Reproducible deployment           | Makes development and deployment environments consistent, so the full stack can be launched with a single command                 |
| Message queue     | Redis Streams                          | Asynchronous event delivery       | See "Decision update" below                                                                                                       |
| Workers           | Python background worker (`worker.py`) | Event processing                  | Decouples ingestion from persistence; consumes the Redis Stream and writes to PostgreSQL                                          |
| Testing tooling   | pytest + Docker Compose `test-runner`  | Automated testing                 | Runs `unit/`, `integration/`, and `e2e/` suites in a consistent containerized environment                                         |
| Authentication    | API keys (`game_id` ↔ key mapping) | Restrict who can call the API | Simplest model that scopes access per game without full OAuth complexity                                                    |
| Rate limiting     | Middleware-based (library TBD)     | Prevent API abuse             | Needed before the API is exposed anywhere beyond localhost                                                                  |

**Decision update — message queue:** v0.2 of this document listed RabbitMQ as the preferred candidate. In implementation, **Redis Streams** was chosen instead, since Redis was already deployed for caching — this avoided introducing a second piece of infrastructure to run and operate. RabbitMQ remains worth revisiting later if Redis Streams becomes a limiting factor.

### 4.2 Planned

| Component         | Technology                         | Role                          | Decision / Rationale                                                                                                        |
| ----------------- | ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Real-time updates | WebSockets                         | Live dashboard updates        | Allows the server to push relevant changes without polling                                                                  |
| CI/CD             | GitHub Actions or similar          | Automated workflow            | Automates testing and deployment checks                                                                                     |
| Load testing      | Locust or k6 (candidate)           | Performance validation        | The `unit`/`integration`/`e2e` suite now exists (see above); load testing and CI integration are the remaining testing gaps |

**Technology decisions marked as candidate/planned are not final until the corresponding milestone is implemented and evaluated.**

---

## 5. Data Model

### 5.1 Event Schema — Implemented

The current Pydantic model is:

```python
class Event(BaseModel):
    event: str
    player_id: str
    game_id: str
    timestamp: str
    level: int
```

The current sample event is:

```json
{
  "event": "enemy_killed",
  "player_id": "player_001",
  "game_id": "demo_game",
  "timestamp": "2026-08-11T00:00:00Z",
  "level": 1
}
```

### 5.2 Event Field Dictionary

| Field       | Type    | Required | Description                                        |
| ----------- | ------- | -------: | -------------------------------------------------- |
| `event`     | string  |      Yes | Name of the gameplay event                         |
| `player_id` | string  |      Yes | Identifier of the player                           |
| `game_id`   | string  |      Yes | Identifier of the game/project                     |
| `timestamp` | string  |      Yes | Event occurrence time; intended format is ISO 8601 |
| `level`     | integer |      Yes | Game level associated with the event               |

### 5.3 Event Dictionary — Initial Registry

| Event Type             | Status                  | Purpose                                                                                           | Example Additional Data          |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| `enemy_killed`         | Implemented             | Records an enemy defeat                                                                           | enemy ID/type may be added later |
| `level_completed`      | Implemented (analytics) | Records completion of a level; drives `GET /levels` completion-rate and avg-completion-time stats | completion time, score           |
| `player_started_level` | Planned                 | Records level start                                                                               | level ID                         |
| `player_died`          | Implemented (analytics) | Records player death; drives `GET /levels` death-rate stats                                       | cause/enemy ID                   |
| `item_collected`       | Planned                 | Records item collection                                                                           | item ID/type                     |
| `dialogue_selected`    | Planned                 | Records dialogue choice                                                                           | dialogue/node ID                 |
| `player_quit`          | Planned                 | Records a player leaving                                                                          | session ID/reason                |

The event registry must be updated whenever a new supported event type is added.

**Note on "Implemented (analytics)":** `level_completed` and `player_died` are consumed by the analytics layer and validated against generated mock telemetry; it is not yet confirmed in project documentation whether the live Godot SDK test game emits these itself (only `enemy_killed` is confirmed SDK-emitted). Verify against `sdk/QuestMetrix.gd` before treating SDK emission as complete.

### 5.4 Database Table — Implemented

```sql
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    event VARCHAR(100) NOT NULL,
    player_id VARCHAR(100) NOT NULL,
    game_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    level INTEGER NOT NULL
);
```

| Column      | Description                                |
| ----------- | ------------------------------------------ |
| `id`        | Unique auto-incrementing record identifier |
| `event`     | Event name                                 |
| `player_id` | Player identifier                          |
| `game_id`   | Game identifier                            |
| `timestamp` | Event occurrence time                      |
| `level`     | Game level                                 |

### 5.5 Indexing Strategy

The current `id` primary key provides an index for record identification and ordering.

Future indexes will be added only when query patterns justify them. Likely candidates include:

```text
(player_id)
(game_id)
(timestamp)
(game_id, timestamp)
(player_id, timestamp)
(event, timestamp)
```

Indexes will be evaluated against actual query performance because excessive indexing increases storage and write costs.

### 5.6 Data Retention

The initial development system has no automated retention policy.

A future production-oriented policy should define:

- raw event retention period
- aggregated analytics retention period
- archival requirements
- deletion requirements
- storage limits

Example future policy:

```text
Raw events:
    retain for a defined period

Aggregated analytics:
    retain longer than raw events

Archived data:
    move to lower-cost storage when required
```

The exact periods are intentionally not fixed until actual storage and analytics requirements are known.

### 5.7 Database Migration Strategy

Database schema changes will be handled through versioned migration scripts rather than manual edits to production databases.

Migration principles:

1. Every schema change receives a version.
2. Changes are committed with the application code that requires them.
3. Migrations must be tested against a clean database.
4. Destructive changes require explicit review.
5. Rollback procedures must be documented for changes where rollback is technically possible.

---

## 6. API Contracts

### 6.1 API Conventions

The API uses JSON for request and response bodies.

The current API is intentionally small.

Authentication and rate limiting are not yet implemented.

### 6.2 `GET /`

**Purpose:** Service health check.

**Current success response:**

```text
HTTP 200 OK
```

```json
{
  "message": "QuestMetrix backend is running!"
}
```

### 6.3 `POST /events`

**Purpose:** Validate and persist one telemetry event.

**Request:**

```http
POST /events
Content-Type: application/json
```

Example:

```json
{
  "event": "enemy_killed",
  "player_id": "player_001",
  "game_id": "demo_game",
  "timestamp": "2026-08-11T00:00:00Z",
  "level": 1
}
```

**Superseded behavior (Milestones 1–4, before the queue existed):**

```text
HTTP 200 OK
```

The event was written directly to PostgreSQL and echoed back in the response body:

```json
{
  "message": "Event stored successfully!",
  "event": {
    "event": "enemy_killed",
    "player_id": "player_001",
    "game_id": "demo_game",
    "timestamp": "2026-08-11T00:00:00Z",
    "level": 1
  }
}
```

**Current behavior (Milestone 5+):** `POST /events` now publishes the validated event onto the Redis Streams queue rather than writing to PostgreSQL synchronously (see §3.1). The actual persistence happens afterward, asynchronously, in `worker.py`. This means:

- The response can no longer honestly claim "stored" at the moment it's returned — only "accepted and queued."
- The exact current status code and response body have not been reconfirmed against the running implementation since this change; the response most likely now represents an acknowledgment-of-queued semantic (commonly `202 Accepted`) rather than the "stored successfully" body above. **Action item:** verify the actual response against the current `POST /events` route handler and update this section with the confirmed contract — don't treat the block above as current until it's checked.

**Current validation error:**

```text
HTTP 422 Unprocessable Entity
```

This is generated by FastAPI/Pydantic when the request does not satisfy the `Event` model.

Example:

```json
{
  "detail": [
    {
      "loc": ["body", "level"],
      "msg": "Field required",
      "type": "missing"
    }
  ]
}
```

**Future error contract:**

The API will standardize application-level errors for cases such as:

| Status | Planned meaning                           |
| ------ | ----------------------------------------- |
| `400`  | Malformed or semantically invalid request |
| `401`  | Missing/invalid authentication            |
| `404`  | Requested resource does not exist         |
| `409`  | Conflict where applicable                 |
| `422`  | Schema validation failure                 |
| `429`  | Rate limit exceeded                       |
| `500`  | Unexpected server error                   |
| `503`  | Dependency temporarily unavailable        |

A common future error structure should be:

```json
{
  "error": {
    "code": "EVENT_INVALID",
    "message": "The event payload is invalid.",
    "request_id": "req_123"
  }
}
```

### 6.4 `GET /events`

**Purpose:** Retrieve stored events ordered by `id`.

**Request:**

```http
GET /events
```

**Success:**

```text
HTTP 200 OK
```

Example:

```json
{
  "events": [
    {
      "id": 1,
      "event": "enemy_killed",
      "player_id": "player_001",
      "game_id": "demo_game",
      "timestamp": "2026-08-11T00:00:00",
      "level": 1
    }
  ]
}
```

**Current behaviour:** all stored events are returned. Because writes are now asynchronous (queued, then processed by `worker.py`), an event may not appear immediately after `POST /events` returns — there can be a short propagation delay between "accepted" and "queryable."

**Future improvements:**

- pagination
- filtering by game
- filtering by player
- filtering by event type
- time-range filtering
- authentication
- rate limiting

### 6.5 Implemented Analytics Endpoints (Milestone 3)

| Method | Endpoint   | Purpose                                                            | Status      |
| ------ | ---------- | ------------------------------------------------------------------ | ----------- |
| `GET`  | `/games`   | Game-level aggregated statistics; cached for 60 seconds            | Implemented |
| `GET`  | `/players` | Player-level aggregated statistics                                 | Implemented |
| `GET`  | `/levels`  | Level completion rate, average deaths, and average completion time | Implemented |

**Note:** these are implemented and live in `analytics.py`, but full request/response contracts (in the format used for `POST`/`GET /events` above) haven't been documented here yet — add them the next time this section is reviewed (§15). Session grouping and the daily retention metric are also implemented (§2.2), but it's unconfirmed whether they're exposed via a dedicated endpoint (e.g. `/sessions`) or used only internally — verify against `analytics.py` before documenting a contract for it.

### 6.6 Planned Endpoints

| Method      | Endpoint | Purpose                           |
| ----------- | -------- | --------------------------------- |
| `WEBSOCKET` | `/ws`    | Real-time event/dashboard updates |

Rate limiting and API-key authentication (Milestone 5, Week 4) will apply to all endpoints above once implemented — see §10.

---

## 7. Error Handling and Recovery

### 7.1 Current Strategy

Current validation errors are handled by FastAPI/Pydantic.

Database failures are not yet given a custom application-level error contract.

### 7.2 Target Strategy

The target system should:

1. Validate input at the API boundary.
2. Reject invalid data early.
3. Return stable error formats.
4. Log unexpected failures.
5. Include a request/correlation ID.
6. Avoid exposing secrets or internal stack traces to clients.
7. Retry transient asynchronous failures where safe.
8. Send repeatedly failing messages to a dead-letter queue.
9. Monitor queue depth and worker failures.

### 7.3 Retry Policy

Retries will be used only for transient failures.

They should use bounded retries and backoff rather than infinite retry loops.

Example:

```text
Attempt 1
   ↓ fail
wait
Attempt 2
   ↓ fail
wait longer
Attempt 3
   ↓ fail
Dead-letter queue
```

The message queue and worker are now implemented (§3.1, §4.1), but this retry/backoff policy and the dead-letter queue itself are not yet built — `worker.py` currently processes messages without confirmed retry logic. The exact retry count and delays are still to be defined.

---

## 8. Testing Strategy

Testing is a first-class project concern.

### 8.1 Unit Testing

**Tool:** pytest

Unit tests will test isolated functions and components.

Examples:

- event validation
- event transformation
- analytics calculations
- session grouping logic
- helper functions

**Coverage goal:** establish a measurable baseline first, then increase coverage for critical business logic. No arbitrary 100% target is required.

### 8.2 Integration Testing

Integration tests will verify interactions between components.

Examples:

- FastAPI + test PostgreSQL database
- `POST /events` → database
- `GET /events` → database
- queue → worker → database
- Redis cache read/write

Integration tests should use a dedicated test database and never modify development/production data.

### 8.3 End-to-End Testing

End-to-end tests will eventually simulate the complete flow:

```text
Godot SDK
   ↓
POST /events
   ↓
API
   ↓
Queue
   ↓
Worker
   ↓
PostgreSQL
   ↓
Analytics API
   ↓
Dashboard
```

### 8.4 Test Organization

As of Milestone 5, tests are grouped as follows (this part is implemented, not just planned):

```text
tests/
├── unit/
├── integration/
├── e2e/
├── fixtures/        (aspirational — not confirmed yet)
└── performance/     (aspirational — Phase 7, load testing)
```

Integration and end-to-end tests run through a dedicated Docker Compose service:

```bash
docker compose --profile test up --build test-runner
```

This launches a `test-runner` container that executes the integration/e2e suites against the containerized stack and exits — giving a consistent environment rather than depending on whatever's installed locally.

### 8.5 Test Case Format

Each important test should document:

- test ID
- purpose
- prerequisites
- input/sample data
- expected result
- dependencies
- execution time
- status

Example:

| ID      | Test                 | Input                        | Expected                  |
| ------- | -------------------- | ---------------------------- | ------------------------- |
| API-001 | Store valid event    | valid `enemy_killed` payload | `200 OK` and row inserted |
| API-002 | Reject missing field | payload without `level`      | `422`                     |
| API-003 | Retrieve events      | database contains event      | event appears in response |

### 8.6 Test Data

Simple tests should use fixed, readable fixtures.

Complex datasets should use automated test-data generation where appropriate.

Test data must not contain real user secrets or personal information.

### 8.7 Test Dependencies

Tests should be independent wherever practical.

If a test genuinely requires another component to exist, that dependency must be documented rather than relying on test execution order.

### 8.8 Coverage and Execution Time

CI should eventually record:

- test count
- pass/fail count
- coverage percentage
- total execution time
- slowest tests

Slow tests should be identified and optimized or moved to an appropriate test stage.

### 8.9 Current Test Status

Milestone 1 was originally manually verified using FastAPI Swagger/OpenAPI, `POST`/`GET /events`, and direct PostgreSQL queries — this manual process was also the primary verification method through Milestone 2 (Godot end-to-end testing effectively replaced manual Swagger calls at that point).

As of Milestone 5, this has changed: the backend test suite has been restructured into `unit`, `integration`, and `e2e` layers and is run automatically through the `test-runner` Docker Compose service (§8.4) rather than purely by hand.

**Still open:**

- CI integration (tests run automatically on push) — Phase 7.
- Coverage tracking/reporting (`pytest-cov`) — not yet wired in.
- A specific test confirming no events are lost or duplicated if the worker restarts mid-processing — this is an explicitly open item on the current milestone's checklist, not yet covered by an automated test.

---

## 9. Monitoring, Logging & Alerting

### 9.1 Logging

The target logging format is structured JSON.

Important fields should include:

```text
timestamp
level
service
request_id
endpoint
status_code
duration_ms
error_code
message
```

Logs must not contain:

- database passwords
- API secrets
- authentication tokens
- unnecessary sensitive player information

**Progress note:** as of Milestone 5, `worker.py` uses Python's `logging` module (`logging.info()`) instead of `print()`, so its output is captured by `docker logs`. This is a first step toward the target above, not the target itself — current worker logs are plain-text `logging.info()` calls, not yet the structured JSON format with the fields listed. The API itself does not yet have equivalent structured logging.

### 9.2 Monitoring Metrics

Important future metrics include:

#### API

- request count
- request latency
- error rate
- HTTP status distribution
- active connections

#### Queue

- queue depth
- message processing time
- retry count
- dead-letter count

#### Database

- connection usage
- query latency
- error rate
- storage usage

#### Workers

- jobs processed
- jobs failed
- worker availability
- processing latency

#### Analytics

- cache hit rate
- analytics query latency
- dashboard request rate

### 9.3 Alerting

Example future alert rules:

```text
API error rate > 5% for 5 minutes
        → alert

Queue depth continuously increasing
        → alert

Dead-letter queue receives messages
        → alert

Database connection usage approaches capacity
        → alert
```

Thresholds will be tuned after baseline performance measurements exist.

---

## 10. Security & Configuration

### 10.1 Current Security Measures

#### Secret Management

Database credentials are stored in `.env` and loaded with `python-dotenv`.

`.env` is excluded from version control.

#### Input Validation

Pydantic validates incoming event structures.

#### SQL Injection Prevention

Database queries use parameterized SQL rather than string concatenation.

#### Repository Hygiene

The `.gitignore` excludes:

```text
.env
venv/
__pycache__/
*.pyc
```

### 10.2 Threat Model

Key threats include:

| Threat                           | Impact                                | Mitigation                                      |
| -------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Malicious/invalid event payloads | Data corruption or application errors | Schema validation and size limits               |
| SQL injection                    | Database compromise                   | Parameterized queries                           |
| Credential exposure              | Database compromise                   | `.env`, secret management, never commit secrets |
| API abuse                        | Service degradation                   | Authentication and rate limiting                |
| Unauthorized game access         | Data leakage                          | Game-scoped API keys/authentication             |
| Queue poisoning                  | Worker failures                       | Validation, retries, dead-letter queue          |
| Sensitive logs                   | Information exposure                  | Structured logging with redaction               |
| Dependency vulnerabilities       | Application compromise                | Dependency updates and security scanning        |

### 10.3 Encryption

Future deployment should use:

```text
Client → HTTPS/TLS → API
```

Database connections should use encrypted transport when deployed outside a trusted local development environment.

Sensitive credentials should be stored using deployment secret-management facilities rather than committed files.

### 10.4 Access Control

The future access model is:

```text
User
 └── Organization
      └── Game
           └── API Key
```

A game must only be able to submit/read data belonging to its authorized scope.

A future access-control matrix should define permissions for:

| Role         | View Analytics | Submit Events | Manage Game | Manage Users |
| ------------ | -------------: | ------------: | ----------: | -----------: |
| Game API Key |             No |           Yes |          No |           No |
| Developer    |            Yes |           Yes |         Yes |           No |
| Admin        |            Yes |           Yes |         Yes |          Yes |

The exact role model is subject to implementation.

### 10.5 Security Testing

Future CI should include:

- dependency vulnerability scanning
- API authentication tests
- authorization tests
- malformed-input tests
- rate-limit tests
- secret-leak checks

---

## 11. Performance & Scalability

### 11.1 Current Performance Scope

The current implementation is a development-scale API with an asynchronous write path (`POST /events` → Redis Streams → `worker.py` → PostgreSQL, as of Milestone 5 — see §3.1) but no load or throughput testing has been performed against it yet.

No production throughput claim is currently made.

### 11.2 Future Performance Metrics

The project should measure:

- events/second
- requests/second
- median latency
- p95 latency
- p99 latency
- database query latency
- queue processing latency
- worker throughput
- cache hit rate
- error rate

### 11.3 Scalability Plan

The current path is:

```text
Synchronous API              ✅ done (Milestones 1–4)
      ↓
Direct database write        ✅ done, then replaced (see below)
      ↓
Measure bottlenecks          ⚠️ not formally measured — queue was introduced
      ↓                          proactively rather than in response to a
      ↓                          measured bottleneck
Introduce queue               ✅ done (Redis Streams, Milestone 5)
      ↓
Scale workers                 ⏳ one worker instance currently; not yet scaled
      ↓
Introduce caching where justified   ✅ done (GET /games, 60s TTL)
      ↓
Load test                     ⏳ not started (Phase 7)
      ↓
Optimize                      ⏳ not started
```

Note the order actually followed diverged slightly from the plan: the queue and cache were introduced as part of Milestone 5's planned scope rather than strictly in response to a measured bottleneck. That's a reasonable call for a learning project, but worth being honest about if this section is ever used to describe the project's engineering process.

### 11.4 Caching

Redis will be used only for data where caching produces a measurable benefit.

Possible candidates:

- frequently requested game metrics
- session lookups
- dashboard summary statistics
- short-lived real-time values

Caching must define:

- cache key
- TTL
- invalidation/update strategy
- fallback behaviour

### 11.5 Optimization Procedure

Performance optimization should follow:

```text
Measure
  ↓
Identify bottleneck
  ↓
Change one thing
  ↓
Measure again
  ↓
Keep/revert based on evidence
```

Optimization should not be based only on assumptions.

### 11.6 Load Testing

A future load-testing milestone will measure event ingestion under increasing load.

A target such as:

```text
5,000 events/sec
```

may be used as an experimental benchmark, but no performance claim will be placed on the resume until it has actually been measured.

---

## 12. Development Workflow

### 12.1 Branching

The current repository uses:

```text
main
  ↑
dev
```

Feature branches may be created from `dev` for larger changes:

```text
dev
 ├── feature/godot-sdk
 ├── feature/analytics
 └── feature/dashboard
```

### 12.2 Commit Convention

Commits should use concise conventional-style prefixes:

```text
feat:
fix:
docs:
test:
refactor:
chore:
```

Examples:

```text
feat: add Godot telemetry SDK
fix: handle invalid event timestamp
docs: update API contract
test: add event ingestion tests
```

### 12.3 Pull Requests

For substantial features:

1. Create a feature branch.
2. Implement the change.
3. Run tests.
4. Update documentation.
5. Review the diff.
6. Open a pull request into `dev`.
7. Review the changes.
8. Merge only when the milestone criteria are satisfied.

For a solo project, the review step can be a self-review checklist.

### 12.4 Code Review Checklist

Before merging:

- Does the change match the milestone?
- Is the code readable?
- Are errors handled?
- Are tests present where appropriate?
- Are secrets excluded?
- Is documentation updated?
- Does the change break an existing API contract?
- Are database migrations included if the schema changed?

### 12.5 Deployment

Development (current, as of Milestone 5):

```text
Local machine
    ↓
docker-compose up -d --build
    ↓
FastAPI + PostgreSQL + Redis + worker
    (dashboard run separately: npm run dev, in dashboard/)
```

This replaces the earlier bare-venv local setup — the full backend stack now starts with a single command, with services communicating over Docker's internal network rather than `localhost`.

Future deployment:

```text
Dockerized services
    ↓
CI/CD
    ↓
Deployment environment
```

Exact cloud infrastructure is not yet selected.

### 12.6 Rollback

A deployment should be reversible.

Rollback methods may include:

- reverting to a known-good application version
- redeploying the previous container image
- rolling back compatible database migrations where possible
- disabling a problematic feature

Database migrations must be designed carefully because application rollback does not automatically make a database schema reversible.

---

## 13. Risks & Mitigations

| Risk                                | Description                                                      | Mitigation                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asynchronous programming complexity | Queues/workers can introduce race conditions and ordering issues | Introduce async components only after synchronous baseline works; add integration tests                                                                                                                                                                                               |
| Session heuristics                  | A session has no universally correct definition                  | Start with a documented time-based heuristic and validate it against data                                                                                                                                                                                                             |
| CORS                                | React and API may run on different origins                       | Configure explicit allowed origins; avoid permissive production CORS                                                                                                                                                                                                                  |
| Scope creep                         | New features can derail the current milestone                    | Maintain `docs/BACKLOG.md`; implement only current milestone scope                                                                                                                                                                                                                    |
| Silent distributed failures         | Queue/worker failures may not be visible to users                | Structured logs, queue monitoring, retries, dead-letter queues, alerts. **Status: now live** — the queue and worker exist as of Milestone 5, but worker-restart resilience hasn't been verified yet (open checklist item) and there's no dead-letter queue or alerting in place.      |
| Duplicate events                    | Retries may cause the same event to be processed more than once  | Introduce event IDs/idempotency strategy before asynchronous retries are enabled. **Status: now live** — the worker exists and is consuming the queue; no idempotency strategy has been confirmed yet, so this should be checked before relying on the pipeline being duplicate-safe. |
| Database bottleneck                 | Direct writes may become the ingestion bottleneck                | Measure throughput, then introduce queue/workers and appropriate indexing                                                                                                                                                                                                             |
| Cache inconsistency                 | Cached analytics can become stale                                | Define TTL/invalidation policy and treat PostgreSQL as the source of truth                                                                                                                                                                                                            |
| Credential leakage                  | Database/API secrets may enter Git                               | `.env` in `.gitignore`, secret scanning, deployment secret management                                                                                                                                                                                                                 |
| API abuse                           | Unauthenticated endpoints can be flooded                         | Authentication and rate limiting before public exposure                                                                                                                                                                                                                               |
| Schema evolution                    | Event formats may change over time                               | Version event schemas and use database migration strategy                                                                                                                                                                                                                             |
| Over-indexing                       | Too many indexes increase write cost                             | Add indexes based on measured query patterns                                                                                                                                                                                                                                          |
| Large payloads                      | Oversized events can consume excessive resources                 | Enforce request/payload size limits                                                                                                                                                                                                                                                   |
| Poor observability                  | Errors may be difficult to diagnose                              | Standardized logs, request IDs, metrics, and alerts                                                                                                                                                                                                                                   |

---

## 14. Definition of Done

A milestone is complete only when:

### Functional

- required features are implemented
- expected inputs and outputs work
- failure cases are handled

### Technical

- tests appropriate to the milestone pass
- no known critical errors remain
- database changes are versioned
- performance has been measured where relevant

### Documentation

- README updated
- TDD updated
- API contracts updated
- event dictionary updated
- architecture diagram updated if architecture changed
- changelog entry added

### Verification

- manual or automated acceptance criteria are satisfied
- test results are recorded

Milestone 1 checklist:

- [x] Backend server starts
- [x] FastAPI root endpoint works
- [x] PostgreSQL is running
- [x] `questmetrix` database exists
- [x] `events` table exists
- [x] Event format defined
- [x] FastAPI validates event data
- [x] `POST /events` accepts events
- [x] Events are inserted into PostgreSQL
- [x] `GET /events` retrieves stored events
- [x] Multiple events can be stored and retrieved
- [x] Manual API verification completed

Automated tests were not yet part of the completed milestone at the time — see §8.9 for current test status.

Milestone 2 checklist (Godot SDK Integration):

- [x] A Godot test project can call `QuestMetrix.track("enemy_killed")`
- [x] The event appears in PostgreSQL without touching Swagger
- [x] SDK handles a dropped connection without crashing the game
- [x] SDK usage documented

Milestone 3 checklist (Analytics Layer):

- [x] `GET /games`, `GET /players` return real aggregates
- [x] Level-level stats (completion rate, deaths, avg time) work
- [x] Sessions can be identified from raw events
- [x] A basic retention number can be computed

Milestone 4 checklist (Analytics Dashboard):

- [x] Dashboard runs and fetches live data from FastAPI
- [x] Raw events, summary stats, and charts are visible
- [x] Loading/error states are handled

Milestone 5 checklist (Scalable Infrastructure) — in progress:

- [x] Events flow through a queue + worker, not a direct insert
- [x] At least one endpoint is cache-backed with correct invalidation (`GET /games`)
- [ ] `POST /events` requires a valid API key
- [ ] Basic rate limiting rejects excessive requests
- [ ] No events are lost or duplicated if the worker restarts mid-processing (unverified)

---

## 15. Documentation Maintenance

This TDD is a living document.

### Update triggers

Update the TDD when:

- architecture changes
- an API contract changes
- a database schema changes
- a new event type is added
- a technology decision changes
- a milestone closes
- a security model changes
- a performance benchmark is established

### Review cadence

At minimum, review the relevant TDD sections at the end of each milestone.

A full consistency review should be performed before a major release or project submission.

### Versioning

Use semantic-style document versions:

```text
v0.1 → initial TDD
v0.2 → expanded design and operational sections
v0.3 → next major architecture update
```

The version should change when the design meaningfully changes, not for every spelling correction.

---

## 16. Troubleshooting Guide

### FastAPI cannot start

Check:

```bash
uvicorn main:app --reload
```

Confirm:

- the terminal is inside `backend/`
- the virtual environment is active
- `main.py` contains `app = FastAPI()`

### `POST /events` returns 422

Check the JSON against:

```python
class Event(BaseModel):
    event: str
    player_id: str
    game_id: str
    timestamp: str
    level: int
```

A required field may be missing or have the wrong type.

### Database connection fails

Check:

- PostgreSQL is running
- port is `5432`
- database name is `questmetrix`
- username is correct
- `.env` exists
- password is correct
- `psycopg2-binary` is installed

### Events are not visible in PostgreSQL

Run:

```sql
SELECT * FROM events;
```

Confirm that the query is being run against the `questmetrix` database.

### `.env` appears in Git

Immediately remove it from tracking and rotate the exposed credentials if it contained real secrets.

Never commit passwords.

### Docker Desktop / WSL fails to start on Windows ("Windows timed out" errors)

This was encountered during initial Docker setup (Milestone 5) and took roughly two nights to resolve — logged here so it doesn't have to be re-diagnosed from scratch next time.

Likely cause: WSL and/or Windows Update corruption interfering with Docker Desktop's WSL2 backend.

Starting points if this recurs:

```powershell
wsl --shutdown
wsl --update
```

- Check Windows Update history for recent updates around the time the issue started.
- Confirm WSL2 (not the legacy Hyper-V backend) is selected in Docker Desktop settings.
- As a last resort, an unregister/reinstall of the WSL distro used by Docker Desktop may be needed.

### `worker.py` doesn't seem to process events

Check:

- Is the `worker` service actually running? (`docker compose ps`)
- Check its logs: `docker logs <worker-container-name>` — it now uses `logging.info()`, so activity should be visible there.
- Confirm the Redis Stream name/consumer group the worker is reading from matches what `POST /events` is publishing to.
- Confirm Redis itself is reachable from the worker container (internal service name, not `localhost`).

---

## 17. Deployment Guide

### Current Development Environment

As of Milestone 5, the system runs locally via Docker Compose rather than a bare Python virtual environment:

```text
Windows
  ↓
Docker Desktop (WSL2 backend)
  ↓
docker-compose up -d --build
  ↓
FastAPI + PostgreSQL (persistent volume) + Redis + worker
  ↓
Dashboard (run separately: npm run dev, in dashboard/)
```

Required `.env` values (see `README.md` for the full example): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`. Note that `DB_HOST`/`REDIS_HOST` are Docker service names (e.g. `db`, `redis`), not `localhost`, since services communicate over Docker's internal network.

The earlier bare-venv setup (Python virtual environment + local PostgreSQL install, no Docker) was the Milestone 1–4 baseline and is superseded by the above.

### Future Deployment Requirements

Before deployment, the project should have:

- environment-specific configuration
- managed secrets
- HTTPS/TLS
- authentication _(not yet — Milestone 5, Week 4)_
- rate limiting _(not yet — Milestone 5, Week 4)_
- database migrations
- health checks
- structured logging _(partial — `worker.py` has basic logging; API doesn't yet; full structured JSON format still pending, §9.1)_
- monitoring
- automated tests _(partial — unit/integration/e2e suite exists and runs via `test-runner`; CI integration and coverage tracking still pending, §8.9)_
- backup strategy
- rollback procedure

The exact hosting provider is not yet selected. Local reproducibility via Docker Compose is complete, which is a meaningful step toward any of the above hosting targets.

---

## 18. Contributing Guidelines

For the current solo project:

1. Work from `dev` or a feature branch.
2. Keep changes scoped to one logical feature.
3. Do not commit `.env`, credentials, or `venv/`.
4. Add/update tests for meaningful logic, and run `docker compose --profile test up --build test-runner` before merging (CI doesn't run this automatically yet — see §8.9).
5. Update documentation when behaviour changes.
6. Use clear commit messages.
7. Do not close a milestone until its Definition of Done is satisfied.

Future external contributors should also follow the project's issue, pull-request, review, and testing process.

---

## 19. Change Log

### v0.3 — 24 Aug 2026

Updated the TDD against `README.md`, `devlog.md`, and `QM_Roadmap.md` to reflect actual progress since v0.2:

- Marked Milestone 3 (Analytics) and Milestone 4 (Dashboard) complete throughout §1, §2, §3.4, and §14.
- Rewrote the current architecture (§3.1) and the ingestion sequence flow (§3.5) to show the queue + worker as implemented, not target — `POST /events` now publishes to Redis Streams instead of writing to PostgreSQL directly.
- Corrected the message-queue technology decision: Redis Streams was implemented, superseding the earlier RabbitMQ candidate (§4.1–4.2).
- Moved background workers and message queue from "Planned" to "Currently Used" in the technology stack; added a testing-tooling row.
- Marked `level_completed` and `player_died` as implemented in the event dictionary (§5.3), with a note on unconfirmed SDK emission.
- Flagged `POST /events`'s response contract as changed but unverified against the current implementation (§6.3), and noted the read-after-write propagation delay this introduces (§6.4).
- Added the three implemented analytics endpoints (`/games`, `/players`, `/levels`) and trimmed the planned-endpoints list to just `/ws` (§6.5–6.6).
- Updated testing status (§8.4, §8.9): the unit/integration/e2e suite and `test-runner` Docker service are now real, not aspirational.
- Noted the initial logging step taken in `worker.py` (§9.1).
- Updated local deployment instructions to Docker Compose in both §12.5 and §17.1, replacing the earlier bare-venv description.
- Added Milestone 2–5 Definition of Done checklists (§14), matching what's already tracked in `docs/ROADMAP.md`.
- Added two real troubleshooting entries from this period: the WSL/Docker Windows Update issue, and a worker-not-processing checklist (§16).
- Flagged the duplicate-events and silent-failure risks (§13) as now live concerns rather than hypothetical, since the queue/worker exist but haven't been verified restart-safe.

### v0.2 — 11 Aug 2026

Updated the TDD to:

- define API request/response contracts
- document current and planned HTTP status codes
- add event dictionary
- add indexing and retention strategy
- add migration strategy
- add technology rationale
- add target sequence flow
- formalize testing strategy
- add test-case management
- add observability strategy
- add threat model and access control
- add performance/scalability strategy
- add development workflow
- add rollback process
- add risk mitigations
- add troubleshooting and deployment guidance
- define documentation maintenance/versioning
- expand the glossary
- distinguish implemented behaviour from future design decisions

### v0.1 — 11 Aug 2026

Initial TDD covering:

- project overview
- scope
- current and target architecture
- technology stack
- event/database model
- API endpoints
- roadmap
- security basics
- risks
- Definition of Done
- glossary

---

## 20. Glossary

| Term                   | Definition                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API                    | Application Programming Interface; rules and endpoints through which software components communicate                                                                   |
| Endpoint               | A specific API route such as `POST /events`                                                                                                                            |
| Backend                | Server-side software responsible for processing requests and data                                                                                                      |
| Frontend               | Client-side software used by the user, such as the analytics dashboard                                                                                                 |
| Database               | Structured persistent storage for application data                                                                                                                     |
| Telemetry              | Data describing activity or behaviour generated by a system                                                                                                            |
| Event                  | A record describing something that happened in the game                                                                                                                |
| SDK                    | Software Development Kit; tools/library that simplify integration with a platform                                                                                      |
| Pydantic               | Python library used here to validate structured API data                                                                                                               |
| PostgreSQL             | Relational database used for persistent QuestMetrix data                                                                                                               |
| Queue                  | A mechanism for temporarily holding work until a worker processes it                                                                                                   |
| Message Queue          | Infrastructure for asynchronously delivering work/messages between services                                                                                            |
| Worker                 | Background process that consumes and processes queued work                                                                                                             |
| Redis                  | In-memory data store planned for low-latency cached data                                                                                                               |
| Cache                  | Temporary/faster storage containing data that can be reused without recomputation                                                                                      |
| WebSocket              | Persistent communication channel allowing server/client real-time messages                                                                                             |
| REST                   | API style based around resources and HTTP methods                                                                                                                      |
| CORS                   | Browser security mechanism controlling cross-origin requests                                                                                                           |
| Rate Limiting          | Restricting how many requests a client can make in a period                                                                                                            |
| API Key                | Credential used to identify and authorize an API client                                                                                                                |
| Idempotency            | Property allowing a repeated operation to produce the same intended result without unwanted duplication                                                                |
| Dead-Letter Queue      | Queue containing messages that could not be successfully processed                                                                                                     |
| CI/CD                  | Automated processes for building, testing, and deploying software                                                                                                      |
| Container              | Isolated package containing software and its runtime dependencies                                                                                                      |
| Docker                 | Platform for building and running containers                                                                                                                           |
| Migration              | Versioned change to a database schema                                                                                                                                  |
| Observability          | Ability to understand system behaviour through logs, metrics, and traces                                                                                               |
| p95 latency            | Response time below which 95% of measured requests fall                                                                                                                |
| p99 latency            | Response time below which 99% of measured requests fall                                                                                                                |
| Session                | A logical period of player activity grouped according to a defined rule                                                                                                |
| Retention              | Measurement of whether users return after an initial period                                                                                                            |
| Replay                 | Ordered representation of a player's sequence of gameplay events                                                                                                       |
| Redis Streams          | Redis's built-in log/queue data structure; used here as the message queue between the API and the worker                                                               |
| Docker Compose profile | A named group of services (e.g. `test`) that only start when explicitly requested, keeping optional services like `test-runner` out of the default `docker-compose up` |
| WSL                    | Windows Subsystem for Linux; the backend Docker Desktop uses to run Linux containers on Windows                                                                        |

---

## 21. Current Roadmap

| #   | Milestone             | Deliverable                                                                                                                                                    | Status   |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Foundation            | FastAPI + PostgreSQL + `POST`/`GET /events`                                                                                                                    | Complete |
| 2   | Game Integration      | Godot SDK and real game → API event flow                                                                                                                       | Complete |
| 3   | Analytics             | Player/level/session statistics                                                                                                                                | Complete |
| 4   | Dashboard             | React analytics dashboard                                                                                                                                      | Complete |
| 5   | Scalability           | Redis, message queue, workers, rate limiting, authentication                                                                                                   | Complete      |
| 6   | Real-Time / Advanced  | WebSockets + session/replay visualization                                                                                                                      | WIP  |
| 7   | Engineering Hardening | CI integration for tests, full structured logging, CI/CD, load testing (Docker and an initial unit/integration/e2e suite were pulled forward into Milestone 5) | Planned  |

A detailed task breakdown should be maintained separately in:

```text
docs/QM_ROADMAP.md
```

---

## 22. Current System Mental Model

The most important current data flow — the write path — is:

```text
Godot Game / Manual JSON
    ↓
POST /events
    ↓
FastAPI
    ↓
Pydantic validation
    ↓
Redis Streams (queue)
    ↓
worker.py
    ↓
psycopg2
    ↓
PostgreSQL
    ↓
events table
```

The raw-event retrieval path is:

```text
events table
    ↓
PostgreSQL
    ↓
psycopg2
    ↓
FastAPI
    ↓
GET /events
    ↓
JSON response
```

The analytics retrieval path is:

```text
events table
    ↓
PostgreSQL (aggregation queries in analytics.py)
    ↓
FastAPI
    ↓
GET /games (60s Redis cache) · GET /players · GET /levels
    ↓
React Dashboard
```

**What's not yet wired end-to-end:** the worker does not update or invalidate the Redis cache after a write, so the queue/worker path and the cache path are currently independent of each other. There's also no confirmed guarantee that an event survives a worker restart without being lost or processed twice.

The eventual target — largely achieved as of this revision, with the gaps noted below — was:

```text
Game
 ↓
SDK                          ✅
 ↓
API                          ✅
 ↓
Queue                        ✅
 ↓
Workers                      ✅
 ↓
PostgreSQL + Redis           ✅ (cache exists; worker↔cache link does not — see above)
 ↓
Analytics API                ✅
 ↓
React Dashboard              ✅ (polling only — no live push yet)
```

The next real transformation (Milestone 5 Week 4 → Milestone 6) is:

```text
Unauthenticated, unthrottled API
    ↓
+ API key authentication
    ↓
+ Rate limiting
    ↓
+ WebSocket broadcast to dashboard
    ↓
+ Session/replay timeline view
```

---

## 23. Design Principles

QuestMetrix follows these principles:

1. **Build incrementally.**
2. **Understand a component before adding the next one.**
3. **Keep implemented and planned behaviour clearly separated.**
4. **Treat API and event schemas as explicit contracts.**
5. **Prefer measurement over assumptions for performance decisions.**
6. **Keep PostgreSQL as the durable source of truth.**
7. **Use caching only when it solves a demonstrated performance problem.**
8. **Design asynchronous processing with retries and failure recovery.**
9. **Keep secrets out of source control.**
10. **Update documentation whenever the architecture or contracts change.**
