import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/reader.js';
import { lane } from '../lane.js';
import { Digest } from '../views/digest.js';
import { Layout } from '../views/layout.js';

export function registerDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const night = readNight(config.runsDir, c.req.param('night'));

    if (night === null) {
      return c.html(
        <Layout title="digest not found" lane={lane()}>
          <h1>digest not found</h1>
          <p class="mute">no run log for this night</p>
        </Layout>,
        404,
      );
    }

    return c.html(
      <Layout title={`digest · ${night.night}`} lane={lane()}>
        <Digest night={night} />
      </Layout>,
    );
  });
}
