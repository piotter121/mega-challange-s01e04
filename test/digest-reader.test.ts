import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const at = '2026-10-29T01:30:00+01:00';
const event = { at, job: 'sample/job', status: 'ok', owner: 'rook' };
const tempDirs: string[] = [];

function tempRuns(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'));
  tempDirs.push(dir);
  return dir;
}

function writeNight(dir: string, events: unknown[]): void {
  writeFileSync(join(dir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n'));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads every fixture job in order, counts bad lines and totals events', () => {
    const result = readNight('runs', night);
    expect(result).not.toBeNull();
    expect(result?.night).toBe(night);
    expect(result?.badLines).toBe(1);
    expect(result?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result?.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null, hasFailure: false,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
        lastStatus: 'ok', lastError: 'upstream 503', hasFailure: false,
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
        lastStatus: 'ok', lastError: 'lock held', hasFailure: false,
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
        lastStatus: 'fail', lastError: 'quota exceeded', hasFailure: true,
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null, hasFailure: false,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });

  it('retains failures and the latest reported error through recovery, in file order', () => {
    const dir = tempRuns();
    const firstAt = '2026-10-29T10:00:00.123+05:30';
    const lastAt = '2026-10-28T01:00:00-04:00';
    writeNight(dir, [
      { ...event, at: firstAt, status: 'fail', error: 'first failure' },
      { ...event, status: 'retry', error: 'latest error' },
      { ...event, error: null },
      { ...event, at: lastAt, owner: null },
    ]);
    expect(readNight(dir, night)).toEqual({
      night, badLines: 0, counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{
        job: event.job, owner: null, runs: 4, retries: 1, lastStatus: 'ok',
        lastError: 'latest error', firstAt, lastAt, hasFailure: true,
      }],
    });
  });

  it('counts malformed JSON and invalid schemas without losing later valid events', () => {
    const dir = tempRuns();
    const invalid: unknown[] = [
      null, [], 42, 'text', {},
      { ...event, at: 123 },
      { ...event, at: 'not a date' },
      { ...event, at: '2026-10-29T01:30:00' },
      { ...event, at: '2026-02-30T01:30:00Z' },
      { ...event, at: '2026-10-29T24:00:00Z' },
      { ...event, at: '2026-10-29T01:30:00+25:00' },
      { ...event, job: '' },
      { ...event, job: 123 },
      { ...event, status: 'unknown' },
      { ...event, owner: undefined },
      { ...event, owner: false },
      { ...event, error: {} },
    ];
    const lines = invalid.map((value) => JSON.stringify(value));
    lines.splice(2, 0, '{broken JSON');
    lines.push(JSON.stringify({ ...event, owner: null, extra: 'ignored' }));
    writeFileSync(join(dir, `${night}.jsonl`), `\r\n  \r\n${lines.join('\r\n')}\r\n`);
    const result = readNight(dir, night);
    expect(result?.badLines).toBe(invalid.length + 1);
    expect(result?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(result?.rows).toEqual([{
      job: event.job, owner: null, runs: 1, retries: 0, lastStatus: 'ok',
      lastError: null, firstAt: at, lastAt: at, hasFailure: false,
    }]);
  });

  it('preserves Z and negative offsets and treats an empty error as reported', () => {
    const dir = tempRuns();
    const firstAt = '2024-02-29T01:02:03Z';
    const lastAt = '2026-10-29T01:02:03.456-03:30';
    writeNight(dir, [
      { ...event, at: firstAt, error: 'old error' },
      { ...event, at: lastAt, error: '' },
    ]);
    expect(readNight(dir, night)?.rows[0]).toMatchObject({
      firstAt, lastAt, lastError: '',
    });
  });

  it('sorts by string comparison and safely groups special property names', () => {
    const dir = tempRuns();
    const jobs = ['z', 'a', '__proto__', 'Z', 'constructor', 'a'];
    writeNight(dir, jobs.map((job) => ({ ...event, job })));
    const rows = readNight(dir, night)?.rows;
    expect(rows?.map((row) => row.job)).toEqual(['Z', '__proto__', 'a', 'constructor', 'z']);
    expect(rows?.find((row) => row.job === 'a')?.runs).toBe(2);
  });

  it('distinguishes a missing night from an existing empty or blank-only file', () => {
    const dir = tempRuns();
    expect(readNight(dir, night)).toBeNull();
    expect(readNight(join(dir, 'missing-directory'), night)).toBeNull();
    for (const content of ['', '\n \t\r\n']) {
      writeFileSync(join(dir, `${night}.jsonl`), content);
      expect(readNight(dir, night)).toEqual({
        night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
      });
    }
  });

  it('returns an existing all-invalid night rather than a missing result', () => {
    const dir = tempRuns();
    writeFileSync(join(dir, `${night}.jsonl`), 'broken\n{}\n\n');
    expect(readNight(dir, night)).toEqual({
      night, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('rejects invalid night names and traversal before accessing the filesystem', () => {
    const dir = tempRuns();
    const nested = join(dir, 'nested');
    mkdirSync(nested);
    writeNight(dir, [event]);
    for (const invalid of [
      `../${night}`, `..\\${night}`, join(dir, night), `${night}.jsonl`,
      `${night}/..`, `${night}\n`, `${night}\0`, '2026-1-28', '',
    ]) {
      expect(readNight(nested, invalid)).toBeNull();
    }
    expect(readNight(dir, night)?.rows).toHaveLength(1);
  });

  it('propagates filesystem errors other than ENOENT', () => {
    const dir = tempRuns();
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
