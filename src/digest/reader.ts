import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ParsedNight, ReadNight, RunEvent } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || match[0] !== value) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)
    || !isTimestamp(value.at)
    || typeof value.job !== 'string' || value.job.length === 0
    || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')
    || (value.owner !== null && typeof value.owner !== 'string')
    || (value.error !== undefined && value.error !== null && typeof value.error !== 'string')) {
    return null;
  }
  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error: value.error ?? null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw error;
  }

  const result: ParsedNight = {
    night,
    rows: [],
    badLines: 0,
    counts: { ok: 0, retry: 0, fail: 0 },
  };
  const jobs = new Map<string, DigestRow>();
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (!event) {
      result.badLines += 1;
      continue;
    }

    result.counts[event.status] += 1;
    const row = jobs.get(event.job);
    if (row) {
      row.owner = event.owner;
      row.runs += 1;
      row.retries += Number(event.status === 'retry');
      row.lastStatus = event.status;
      if (event.error !== null) row.lastError = event.error;
      row.lastAt = event.at;
      row.hasFailure ||= event.status === 'fail';
    } else {
      jobs.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: Number(event.status === 'retry'),
        lastStatus: event.status,
        lastError: event.error,
        firstAt: event.at,
        lastAt: event.at,
        hasFailure: event.status === 'fail',
      });
    }
  }
  result.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return result;
};
