export const REPORTING_TIME_ZONE = "UTC";

function getDateParts(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((parts, part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }

      return parts;
    }, {});
}

export function getReportingDate(timestamp) {
  if (typeof timestamp !== "string") {
    return null;
  }

  const dateMatch = timestamp.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s)/);

  if (!dateMatch) {
    return null;
  }

  const hasTimeZoneOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);

  // A timezone-less timestamp is already expressed in the reporting timezone.
  if (!hasTimeZoneOffset) {
    const date = new Date(`${dateMatch[1]}T00:00:00Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dateMatch[1]
    ) {
      return null;
    }

    return dateMatch[1];
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function aggregateEventsByDate(events) {
  const eventsByDate = new Map();

  for (const event of events) {
    const date = getReportingDate(event.timestamp);

    if (!date) {
      continue;
    }

    const currentCount = eventsByDate.get(date) ?? 0;
    eventsByDate.set(date, currentCount + 1);
  }

  return Array.from(eventsByDate, ([date, eventCount]) => ({
    date,
    events: eventCount,
  })).sort((first, second) => first.date.localeCompare(second.date));
}
