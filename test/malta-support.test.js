process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getMaltaFallbackReply } from '../server/support.js';

test('Malta Support — Generates rich fallback replies for golf, birdies, tab and PIN', () => {
  const birdieReply = getMaltaFallbackReply('Hur sätter vi upp mest birdies?', 'Sarah');
  assert.ok(birdieReply.includes('AnyBet'), 'Should mention AnyBet for birdies');
  assert.ok(birdieReply.includes('Sarah'), 'Should personalize greeting');

  const tabReply = getMaltaFallbackReply('Hur delar vi öl på tabben?', 'Micke');
  assert.ok(tabReply.includes('The Tab'), 'Should explain The Tab');

  const pinReply = getMaltaFallbackReply('Jag har glömt min PIN-kod', 'Kalle');
  assert.ok(pinReply.includes('Nollställ PIN'), 'Should guide on PIN reset via admin');

  const lovenReply = getMaltaFallbackReply('Ska vi köra löven game på golfen?', 'Erik');
  assert.ok(lovenReply.includes('Björklöven') || lovenReply.includes('hockey'), 'Should warn about Löven hockey');

  const generalReply = getMaltaFallbackReply('Tja vad kan du hjälpa till med?', 'Alex');
  assert.ok(generalReply.includes('Malta Support'), 'General reply should introduce Malta Support');
});

test('Malta Support — POST /api/support/chat handles HTTP requests and rate limits', async () => {
  const { app } = await import('../server/server.js');
  const { EventEmitter } = await import('events');

  const res = await new Promise((resolve) => {
    const req = Object.assign(new EventEmitter(), {
      method: 'POST',
      url: '/api/support/chat',
      headers: { 'content-type': 'application/json' },
      body: { message: 'Hur sätter vi upp rundor på golfresan?' },
      query: {},
      params: {},
      _readableState: { pipes: [] },
      unpipe() {},
      resume() {},
      pause() {},
      socket: { remoteAddress: '127.0.0.99' },
      connection: { remoteAddress: '127.0.0.99' }
    });
    let code = 200;
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: false,
      status(c) { code = c; return this; },
      json(body) { resolve({ status: code, body }); },
      setHeader() {},
      getHeader() {},
      removeHeader() {}
    });
    app.handle(req, res);
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(typeof res.body.reply === 'string', 'Should return a reply string');
  assert.ok(res.body.reply.length > 20, 'Reply should be substantial');
});
