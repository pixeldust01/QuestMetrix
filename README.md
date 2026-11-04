# QuestMetrix - Game Telemetry & Analytics Platform

## Overview

QuestMetrix is a game telemetry and analytics platform designed to help
game developers collect, store, process, and visualize gameplay data.

The platform will allow games to send gameplay events such as player deaths,
enemy kills, level completions, and item collections to a backend system.
These events can then be used to generate meaningful gameplay analytics.

## Problem

Game developers need gameplay data to understand how players interact
with their games. Important information such as player progression,
deaths, level completion, and session behaviour can be difficult to
collect and analyse without dedicated infrastructure.

QuestMetrix aims to provide a simple developer-focused platform for
collecting gameplay telemetry and turning raw gameplay events into
useful analytics.

## Goals

- Provide an easy-to-use SDK for sending gameplay events from games.
- Provide a backend API for receiving telemetry data.
- Store gameplay events reliably in a database.
- Process raw events into useful gameplay analytics.
- Provide a dashboard for visualizing gameplay data.
- Support multiple games and players.
- Explore scalable backend concepts such as asynchronous processing,
  caching, rate limiting, and real-time updates.

## Architecture

The planned architecture is:

Game -> QuestMetrix SDK -> Event API -> Message Queue -> Processing Engine -> PostgreSQL / Redis -> Analytics Dashboard

### Current Implementation

The current system implements a decoupled, asynchronous pipeline:

Godot SDK -> FastAPI -> Redis (Queue) -> Worker -> PostgreSQL

Events are ingested by the API, pushed to a Redis Stream, and processed
asynchronously by a background worker that writes to the database. This
improves ingestion speed and resilience.

## Tech Stack

### Current

- Python
- FastAPI
- Pydantic
- PostgreSQL
- psycopg2
- python-dotenv
- Git
- GitHub
- Godot / GDScript SDK (partial)
- React
- Redis
- Docker
- Message Queue

### Planned

- WebSockets
- Automated testing
- CI/CD
- Load testing

## Getting Started

The entire QuestMetrix stack is managed by Docker Compose, allowing you to run the complete platform with a single command.

### Prerequisites

- Docker
- Docker Compose

### Running the Platform

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd questmetrix
    ```

2.  **Environment Variables:**
    Create a `.env` file in the project root. You can copy the example file if one exists, and update it with your PostgreSQL credentials.

    ```env
    # .env
    DB_HOST=db
    DB_PORT=5432
    DB_NAME=questmetrix
    DB_USER=postgres
    DB_PASSWORD=your_postgresql_password

    REDIS_HOST=redis
    REDIS_PORT=6379
    ```

3.  **Launch the Stack:**

    ```bash
    docker-compose up -d --build
    ```

    This command builds and starts the FastAPI backend, PostgreSQL, Redis, and the background worker.
    - **API:** `http://localhost:8000`
    - **API Docs:** `http://localhost:8000/docs`
    - **Dashboard:** `http://localhost:5173` (run `npm install && npm run dev` in `dashboard/`)

### Godot Client Setup

For instructions on setting up the Godot test client, please refer to the SDK's documentation in `sdk/README.md`.

## Features

### Currently Implemented

- FastAPI backend
- PostgreSQL database
- Telemetry event schema
- `POST /events`
- `GET /events`
- Event validation using Pydantic
- Persistent telemetry storage
- Godot telemetry SDK (partial)
- Godot → FastAPI event submission
- SDK error handling for unreachable backend
- Analytics endpoints to retrieve aggregated game, player, and level data
- Session and retention analysis
- React analytics dashboard
- Redis caching
- Docker
- Message queue
- Asynchronous event processing
- Background workers
- API authentication
- API rate limiting

### Planned

- WebSockets
- Session/replay analysis
- CI/CD
- Load testing

## Roadmap

### Phase 1 - Backend Foundation

- [x] Set up project repository
- [x] Set up FastAPI backend
- [x] Define initial telemetry event schema
- [x] Set up PostgreSQL
- [x] Create events table
- [x] Implement `POST /events`
- [x] Implement `GET /events`

### Phase 2 - Game SDK

- [x] Create QuestMetrix Godot SDK
- [x] Implement `track()` function
- [x] Connect Godot SDK to the backend
- [x] Send gameplay events from a test game

### Phase 3 - Analytics

- [x] Implement basic gameplay metrics
- [x] Add player statistics
- [x] Add level progression analysis
- [x] Add session analysis

### Phase 4 - Dashboard

- [x] Build React dashboard
- [x] Display raw events
- [x] Display gameplay metrics
- [x] Add charts and visualizations

### Phase 5 - Scalable Infrastructure

- [x] Add Redis caching
- [x] Add asynchronous event processing
- [x] Add message queue
- [x] Add background workers
- [x] Add API rate limiting
- [x] Add authentication and API keys

### Phase 6 - Real-Time + Session Replay

- [x] Add WebSockets
- [ ] Add session/replay analysis

### Phase 7 - Engineering Hardening

- [ ] Add automated tests
- [ ] Add logging and monitoring
- [x] Add Docker support
- [ ] Add CI/CD
- [ ] Perform load testing
- [ ] Document system architecture

## Testing

The project includes a multi-layered testing suite organized into `unit`, `integration`, and `e2e` (end-to-end) tests. These are managed via a dedicated Docker service for consistency.

### Running Tests

- **Unit Tests:** Test individual components in isolation.

  ```bash
  # From the backend/ directory
  python -m pytest tests/unit
  ```

- **Integration & E2E Tests:** Verify the full data pipeline from API ingestion to database storage. These are run using a dedicated Docker Compose profile to ensure a consistent, containerized environment.
  ```bash
  docker-compose --profile test up --build test-runner
  ```
  This command launches a `test-runner` service that executes the integration and e2e suites and then exits.

## License

This project is licensed under the MIT License.
