process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';

const { server } = await import('../server/server.js');

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test('App QR and share endpoints enforce HTTPS on production/railway domains', async (t) => {
  // 1. App QR with host header = betpals-production.up.railway.app
  const res1 = await fetch(`${base}/api/app/qr`, {
    headers: {
      'host': 'betpals-production.up.railway.app',
      'x-forwarded-proto': 'http'
    }
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.ok(data1.url.startsWith('https://betpals-production.up.railway.app'), `Expected https URL but got: ${data1.url}`);
  assert.ok(data1.qr.startsWith('data:image/png;base64,'));

  // 2. App QR with explicit http:// target URL on railway
  const res2 = await fetch(`${base}/api/app/qr?url=http://betpals-production.up.railway.app/test`, {
    headers: {
      'host': 'betpals-production.up.railway.app'
    }
  });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.ok(data2.url.startsWith('https://betpals-production.up.railway.app/test'), `Expected https URL but got: ${data2.url}`);

  // 3. App QR on localhost still preserves http for local development
  const res3 = await fetch(`${base}/api/app/qr`, {
    headers: {
      'host': 'localhost:3001'
    }
  });
  assert.equal(res3.status, 200);
  const data3 = await res3.json();
  assert.ok(data3.url.includes('localhost:5173'));

  // 4. Event QR endpoint with railway host
  const events = db.getEvents();
  if (events && events.length > 0) {
    const event = events[0];
    const res4 = await fetch(`${base}/api/events/${event.id}/qr`, {
      headers: {
        'host': 'betpals-production.up.railway.app',
        'x-forwarded-proto': 'http'
      }
    });
    assert.equal(res4.status, 200);
    const data4 = await res4.json();
    assert.ok(data4.url.startsWith('https://betpals-production.up.railway.app/?page=event'), `Expected https URL but got: ${data4.url}`);
  }

  server.close();
});
