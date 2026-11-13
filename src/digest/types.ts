export type RunStatus = 'ok' | 'retry' | 'fail';

// Validated JSONL event. The reader normalizes an omitted error to null.
// at is an ISO 8601 timestamp with an explicit offset (or Z), kept verbatim.
// job must be nonempty; owner is a string or null; error is a string or null.
export type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

export type DigestRow = {
  job: string;
  // Owner from the last valid event, including an explicit null.
  owner: string | null;
  // All valid events for this job, including retries and failures.
  runs: number;
  // Number of events whose status is retry (not runs minus one).
  retries: number;
  lastStatus: RunStatus;
  // Most recent non-null error; retained after recovery. Null if none reported.
  lastError: string | null;
  // First/last refer to file order, not timestamp sorting. Preserve the offsets.
  firstAt: string;
  lastAt: string;
  // True if ANY valid event failed, even when lastStatus is ok.
  hasFailure: boolean;
};

// Event totals for the board, NOT counts of jobs by their final status.
export type StatusCounts = Record<RunStatus, number>;

export type ParsedNight = {
  night: string;
  // One row per job, ascending by job using string comparison (not locale).
  rows: DigestRow[];
  // Nonblank lines with invalid JSON or an invalid event shape.
  badLines: number;
  // All three keys are always present; their sum equals the sum of rows[].runs.
  counts: StatusCounts;
};

/**
 * Synchronously read runsDir/<night>.jsonl. Implemented later in reader.ts.
 *
 * Return null for an invalid night (anything other than YYYY-MM-DD) or ENOENT;
 * never permit path traversal. Other filesystem errors propagate to the caller.
 * A present empty/blank-only file returns { night, rows: [], badLines: 0,
 * counts: { ok: 0, retry: 0, fail: 0 } }, NOT null. An all-invalid file also
 * returns empty rows, with badLines counting its invalid nonblank lines.
 *
 * Parse each nonblank line independently as unknown and validate at the edge:
 * require an object with at, job, status and owner as described above; error
 * may be omitted, null or a string. Ignore extra properties. Invalid lines
 * increment badLines and do not contribute to rows or counts; never throw for
 * malformed log content. Blank lines (including a trailing newline) are ignored.
 * Aggregate valid events in file order and sort only the resulting job rows.
 * Never convert timestamps for display or mutate the source log.
 *
 * Page and JSON routes consume this same result; null maps to HTTP 404.
 */
export type ReadNight = (runsDir: string, night: string) => ParsedNight | null;
