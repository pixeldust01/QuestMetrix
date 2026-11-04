**Documenting Project Status** : Started 11 Aug 2026

A chronological log of the project's development milestones.

### 5 November 2026

- **Implemented Real-Time Dashboard Updates via WebSockets (M7):** Successfully connected the React dashboard to the WebSocket endpoint, enabling live data updates without page refreshes.
- **Key Features:**
  - The dashboard now receives and displays events in real-time as they are broadcast from the backend.
  - All summary statistics and charts are updated dynamically, providing an up-to-the-minute view of game analytics.
  - Implemented logic to ensure incoming events are chronologically ordered and consistent with data retrieved via the REST API.
- **Verification:** End-to-end testing confirmed that events sent from the game client are reflected in the dashboard in real-time.

### 19 September 2026

- **Implemented Real-Time Event Broadcasting via WebSockets (M6):** Established the foundation for live front-end updates by creating an end-to-end WebSocket pipeline.
- **Architecture:**
  - Added a WebSocket endpoint and connection manager to the FastAPI application.
  - Utilized Redis Pub/Sub to decouple the worker from the API. The worker now publishes successfully processed events to a Redis channel.
  - The FastAPI server subscribes to this channel and broadcasts incoming messages to all connected WebSocket clients.
- **Verification:** A new integration test was added to verify that events sent through the `POST /events` endpoint are correctly processed and broadcast to a connected WebSocket client.

### 17 September 2026

- **Implemented API Key Authentication (M5W4):** Secured the `POST /events` endpoint by requiring a valid `X-API-Key` header. This included creating a `game_api_keys` table, an `auth.py` verification module, and testing all success (200) and failure (401/403) scenarios.

### 28 August 2026

- **Completed step 1 of M5W4 (rate-limiting):** Added isolated test for rate limiting, and ignored it from `test-runner` profile. To test current rate limiting, run `python -m pytest tests/integration/test_rate_limit.py` from `/backend`.
- Install slowapi, add it to requirements.txt, create Limiter, attach limiter to FastAPI, add 429 exception handler, protect POST /events, rebuild backend container and verified normal POST /events still works.
- Enhanced `test-runner` test suite.
- Standardized the timestamps across all test files by removing the trailing 'Z'. This ensures consistency with the database schema.

### 23 August 2026

- Improved and expanded the suite of tests in `test-runner`. Restructured the backend testing suite into `unit`, `integration`, and `e2e` tests. A new `test-runner` Docker service now has a separate profile and runs integration/e2e tests, providing a flexible framework for verifying the entire pipeline. Use the command: `docker compose --profile test up --build test-runner`.
- Created a `worker.py` to facilitate asynchronous path (SDK → API → queue → worker → DB), and implemented proper logging in it using `logging.info()` (instead of `print()`) to ensure output is captured by `docker logs`.
- Added version numbers for PostGres and Redis in `docker-compose.yml`.
- Changed `POST /events` to push to the queue instead of writing directly to PostgreSQL.
- Introduced a message queue using Redis Streams, leveraging the existing Redis setup.
- Completed Redis caching; next is adding a worker to connect PostgreSQL integrity checks with the Redis cache and stream.

  **Next Steps:** M5W3 almost finished. After finishing that up, next is week 4. Improve `test_event_flow.py` in the e2e test suite.

### 21 August 2026

- **Finished Dockerizing Services:** Completed the containerization of the backend by adding a PostgreSQL container with persistent volume storage.
- **Integrated with Docker Compose:** All services (FastAPI, PostgreSQL, Redis) are now managed by Docker Compose, communicating via internal service names.
- **Verified End-to-End Flow:** Confirmed that all API endpoints (`/events`, `/games`) work correctly with the fully containerized stack. The project can now be run reproducibly.

  **Next Steps:** Continue with Milestone 5, Week 2 objectives.

### 20 August 2026

- **Containerized Core Services:** Dockerized the FastAPI backend and PostgreSQL database. Created the necessary `Dockerfile`, `.dockerignore`, and `docker-compose.yml` to manage the services, with the database accessible via pgAdmin.
- **Implemented Redis Caching:** Integrated Redis to improve performance. The `/games` endpoint now features a 60-second cache, with logic to handle cache hits, expiry, and manual invalidation successfully tested.

  **Challenges:**
  - Spent two nights troubleshooting WSL and Windows Update corruption issues that caused persistent "Windows timed out" errors while setting up Docker for the first time. On the bright side, I caught up on some great short dramas.

  **Next Steps:** Prepare to work on Milestone 5: Week 2, Redis Streams (?). Research.

### 15 August 2026

- **Completed Milestone 4 (Analytics Dashboard):** Successfully developed a React application in the `dashboard/` directory to visualize key analytics. The dashboard connects to the FastAPI backend and features a raw event table, summary statistic cards, and charts for trends like events over time and level completion rates. It also properly handles UI loading and error states.

### 13 August 2026

- Implemented session grouping based on a 30-minute inactivity window and added a basic daily retention metric to track returning players. Finished with Milestone 3.
- Worked on the analytics layer: added SQL aggregations and `GET /games` and `GET /players`, generated realistic multi-player/multi-level mock telemetry, and implemented `GET /levels` for completion rates, deaths, and average completion time. I then refactored the backend into `main.py`, `events.py`, `analytics.py`, and `database.py`, while verifying timestamp handling and all five endpoints.

**Next:** start with week 1, for Milestone 4: Analytics Dashboard.

### 12 August 2026

- Since Milestone 2, I replaced manual Swagger event submission with a working Godot SDK: `QuestMetrix.track()` now sends real gameplay events to FastAPI, with error handling for an unreachable backend and SDK documentation.

### 11 August 2026

- **Completed Milestone 2 (Godot SDK Integration):** Successfully created and integrated the `QuestMetrix.gd` SDK. A test Godot game can now send events directly to the backend API, and the SDK includes error handling and documentation.
- **Updated Testing Workflow:** The primary testing method has shifted from manual API calls to end-to-end testing from the Godot client, providing a more realistic verification of the event pipeline.
- **Comprehensive Documentation Sync:** Revised the TDD, Roadmap, and README files to reflect the completion of Phase 2, update architecture diagrams, and remove outdated files and references.

  **Challenges:** Ensuring all documentation was updated consistently to reflect the rapid progress.

  **Next Steps:** Prepare for Milestone 3: Analytics Layer.

### 10 August 2026

- **Project Foundation:** The project's identity, GitHub repository, and local directory structure have been established.
- **Backend Development:** A FastAPI server is running with a `/events` endpoint to receive and validate `enemy_killed` telemetry events using a Pydantic model.
- **Database Integration:** A PostgreSQL database named `questmetrix` has been created with an `events` table, and the backend is securely connected to it.
- **Tooling & Verification:** The development workflow is supported by `uvicorn`, FastAPI's interactive documentation for API testing, and pgAdmin for database management.

  **Challenges:** None so far

  **Next Steps:** Begin Milestone 2: Godot SDK Integration to allow game events to be sent directly to the API.
