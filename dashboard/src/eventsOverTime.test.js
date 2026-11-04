import assert from "node:assert/strict";
import test from "node:test";

import { aggregateEventsByDate, getReportingDate } from "./eventsOverTime.js";

function event(timestamp) {
  return { timestamp };
}

test("sorts out-of-order events chronologically", () => {
  const chartData = aggregateEventsByDate([
    event("2026-09-10T12:00:00"),
    event("2026-11-04T12:00:00"),
    event("2020-11-05T12:00:00"),
  ]);

  assert.deepEqual(chartData, [
    { date: "2020-11-05", events: 1 },
    { date: "2026-09-10", events: 1 },
    { date: "2026-11-04", events: 1 },
  ]);
});

test("increments an existing date bucket", () => {
  const chartData = aggregateEventsByDate([
    event("2026-09-15T08:00:00"),
    event("2026-09-15T18:00:00"),
  ]);

  assert.deepEqual(chartData, [
    { date: "2026-09-15", events: 2 },
  ]);
});

test("groups timestamps with the same calendar date", () => {
  const chartData = aggregateEventsByDate([
    event("2026-11-05T00:01:00"),
    event("2026-11-05T23:59:59"),
    event("2026-11-05T15:00:00+00:00"),
  ]);

  assert.deepEqual(chartData, [
    { date: "2026-11-05", events: 3 },
  ]);
});

test("accepts space-separated timestamps from the Redis event stream", () => {
  assert.deepEqual(
    aggregateEventsByDate([
      event("2026-11-05 20:00:00"),
    ]),
    [{ date: "2026-11-05", events: 1 }],
  );
});

test("uses UTC for timestamps with offsets", () => {
  assert.equal(
    getReportingDate("2026-11-05T00:30:00-02:00"),
    "2026-11-05",
  );
  assert.equal(
    getReportingDate("2026-11-04T23:30:00-02:00"),
    "2026-11-05",
  );
});

test("ignores invalid timestamps", () => {
  assert.deepEqual(
    aggregateEventsByDate([
      event("not-a-timestamp"),
      event("2026-99-99T12:00:00"),
      event(null),
      event("2026-11-05T12:00:00"),
    ]),
    [{ date: "2026-11-05", events: 1 }],
  );
});

test("produces the same chart data regardless of event arrival order", () => {
  const events = [
    event("2026-09-15T08:00:00"),
    event("2020-11-05T08:00:00"),
    event("2026-11-04T08:00:00"),
  ];

  assert.deepEqual(
    aggregateEventsByDate(events),
    aggregateEventsByDate([...events].reverse()),
  );
});
