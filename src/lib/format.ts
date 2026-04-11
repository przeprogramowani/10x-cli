/**
 * Shared human-output formatters used by multiple commands.
 *
 * These helpers convert machine-friendly API shapes (ISO timestamps, raw
 * enums) into the short, friendly phrases the CLI prints to stderr. They
 * are *not* used on the JSON output path — machines get the raw values.
 */

/**
 * Format an ISO-8601 release timestamp into a human-friendly phrase.
 *
 *   "2026-05-11T07:00:00Z" + now=2026-04-11  →  "May 11, 2026 (in 30 days)"
 *   "2026-05-11T07:00:00Z" + now=2026-05-11  →  "May 11, 2026"
 *   "2026-05-11T07:00:00Z" + now=2026-05-10  →  "May 11, 2026 (tomorrow)"
 *
 * The absolute date is rendered in UTC so a student on `Europe/Warsaw`
 * and a student on `America/Los_Angeles` see the same "May 11" for the
 * same moment. The relative phrase is computed off UTC day-starts so
 * "in N days" / "tomorrow" never drifts by one at midnight boundaries.
 *
 * Falls back to the raw ISO string on parse failure so we never lose
 * information a machine-consuming user might still need.
 */
export function formatReleaseAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;

  const absolute = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const msPerDay = 24 * 60 * 60 * 1_000;
  const startOfTarget = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const startOfNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((startOfTarget - startOfNow) / msPerDay);

  if (days <= 0) return absolute;
  if (days === 1) return `${absolute} (tomorrow)`;
  return `${absolute} (in ${days} days)`;
}
