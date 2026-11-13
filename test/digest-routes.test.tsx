import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { ParsedNight } from '../src/digest/types.js';

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

let runsDir: string;

function app() {
  return createApp({ ...baseConfig, runsDir });
}

function jobRow(html: string, job: string) {
  const match = html.match(new RegExp(`<tr(?=[^>]*data-job="${job}")[^>]*>[\\s\\S]*?</tr>`));
  expect(match, `row for ${job}`).not.toBeNull();
  return match?.[0] ?? '';
}

beforeEach(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  vi.stubEnv('LANE_MARKER', 'TEST-MARKER');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(runsDir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('renders sorted jobs and returns the complete matching parsed night', async () => {
    await writeFile(
      join(runsDir, '2026-10-28.jsonl'),
      [
        '{"at":"2026-10-28T23:00:00+02:00","job":"alpha","status":"fail","owner":"<owner>","error":"fatal & <boom>"}',
        '{"at":"2026-10-29T00:00:00-07:00","job":"alpha","status":"ok","owner":null}',
        '{"at":"2026-10-28T22:00:00+02:00","job":"zeta","status":"retry","owner":"<ops & owner>"}',
        '{"at":"2026-10-28T22:01:00+02:00","job":"zeta","status":"retry","owner":"<ops & owner>"}',
        '{"at":"2026-10-28T22:02:00+02:00","job":"zeta","status":"retry","owner":"<ops & owner>"}',
        '{"at":"2026-10-28T22:03:00+02:00","job":"zeta","status":"ok","owner":"<ops & owner>"}',
        '{not json}',
        '{"at":"2026-10-28T22:04:00+02:00","job":"ignored","status":"wat","owner":"ops"}',
      ].join('\n'),
    );

    const [htmlResponse, jsonResponse] = await Promise.all([
      app().request('/digest/2026-10-28'),
      app().request('/api/digest/2026-10-28'),
    ]);
    const html = await htmlResponse.text();

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');

    const expected: ParsedNight = {
      night: '2026-10-28',
      rows: [
        {
          job: 'alpha', owner: null, runs: 2, retries: 0, lastStatus: 'ok',
          lastError: 'fatal & <boom>', firstAt: '2026-10-28T23:00:00+02:00',
          lastAt: '2026-10-29T00:00:00-07:00', hasFailure: true,
        },
        {
          job: 'zeta', owner: '<ops & owner>', runs: 4, retries: 3, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T22:00:00+02:00',
          lastAt: '2026-10-28T22:03:00+02:00', hasFailure: false,
        },
      ],
      badLines: 2,
      counts: { ok: 2, retry: 3, fail: 1 },
    };
    expect(await jsonResponse.json()).toEqual(expected);

    const alpha = jobRow(html, 'alpha');
    const zeta = jobRow(html, 'zeta');
    expect(html.indexOf('data-job="alpha"')).toBeLessThan(html.indexOf('data-job="zeta"'));
    expect(alpha).toMatch(/class="[^"]*warn[^"]*"/);
    expect(zeta).toMatch(/class="[^"]*warn[^"]*"/);
    expect(alpha).toContain('—');
    expect(alpha).toContain('2026-10-28T23:00:00+02:00');
    expect(alpha).toContain('2026-10-29T00:00:00-07:00');
    expect(alpha).toContain('fatal &amp; &lt;boom&gt;');
    expect(html).toContain('&lt;ops &amp; owner&gt;');
    expect(html).not.toContain('<ops & owner>');
    expect(html).not.toContain('<boom>');
  });

  it('returns 404 for absent and invalid night names without traversing runs', async () => {
    const requests = [
      '/digest/2026-10-27',
      '/api/digest/2026-10-27',
      '/digest/2026-10-28%2F..%2Fsecret',
      '/api/digest/2026-10-28%2F..%2Fsecret',
    ];

    for (const path of requests) {
      expect((await app().request(path)).status, path).toBe(404);
    }
  });

  it('renders an existing empty night as nothing ran and returns zeroed JSON', async () => {
    await writeFile(join(runsDir, '2026-10-29.jsonl'), '\n\n');

    const [htmlResponse, jsonResponse] = await Promise.all([
      app().request('/digest/2026-10-29'),
      app().request('/api/digest/2026-10-29'),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      night: '2026-10-29',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    } satisfies ParsedNight);
  });
});
