import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMaltaFallbackReply as reply, matchSupportTopics, SUPPORT_TOPICS } from '../server/support.js';

const topic = (q) => matchSupportTopics(q)[0]?.topic.id || null;

test('offline answers find the right topic for everyday questions', () => {
  const cases = {
    'Hur avgör jag en match?': 'decide',
    'Hur tar jag bort ett spel?': 'remove',
    'Hur skapar jag ett Välj flera-spel där flest rätt vinner?': 'picks',
    'Varför står det att jag ska swisha fast eventet pågår?': 'running',
    'Hur funkar Blind 10?': 'blind10',
    'Var ser jag mina notiser?': 'bell',
    'Hur lägger jag till en vän?': 'friends',
    'Min kompis vill gå med i eventet': 'event',
    'Hur delar vi notan för lunchen?': 'bill',
    'Jag har glömt min PIN': 'pin'
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(topic(q), id, q);
});

test('whole words, not pieces of words: "kurs" is not the stock market, "tabellen" is not The Tab', () => {
  assert.notEqual(topic('Vilken kurs har golfbanan?'), 'stocks');
  assert.notEqual(topic('Hur funkar tabellen?'), 'swish');
  assert.equal(topic('Hur går börsen idag?'), 'stocks');
});

test('offline facts match the app: events, whole kronor, running debts; no dead-end "break" answer', () => {
  const all = ['Hur avgör jag?', 'swish', 'löpande', 'event', 'nota'].map(q => reply(q, 'A')).join('\n');
  assert.doesNotMatch(all, /öre|Avsluta Turnering/);
  assert.match(reply('Hur funkar swish?', 'A'), /per person/);
  assert.match(reply('asdf qwerty', 'A'), /Välj ett ämne/);
  assert.doesNotMatch(reply('asdf qwerty', 'A'), /har rast/);
  assert.ok(SUPPORT_TOPICS.length >= 6);
});

test('the AI gets the current app facts, a time limit and the key in a header', () => {
  const src = readFileSync(new URL('../server/support.js', import.meta.url), 'utf8');
  assert.match(src, /🏆 Avsluta event & kora vinnare/);
  assert.match(src, /Löpande – görs upp när eventet är slut/);
  assert.match(src, /'x-goog-api-key': apiKey/);
  assert.doesNotMatch(src, /\?key=\$\{apiKey\}/);
  assert.match(src, /const PER_MODEL_TIMEOUT_MS = 8000;/);
  assert.match(src, /String\(message \|\| ''\)\.slice\(0, MAX_MESSAGE_CHARS\)/);
});

test('the chat shows an honest status, tappable links and our own rate-limit message', () => {
  const ui = readFileSync(new URL('../src/components/maltaSupport.js', import.meta.url), 'utf8');
  assert.match(ui, /Snabbsvar \(AI offline\)/);
  assert.match(ui, /data\?\.reply \|\| data\?\.error \|\|/);
  assert.match(ui, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(ui, /AI-Concierge Online • St\. Julian’s • 24\/7/);
});

test('review fixes: removal intent wins, same-phone games are not on The Tab, Blind 10 ties, honest badge', async () => {
  assert.equal(topic('Hur tar jag bort ett avgjort spel?'), 'remove');
  assert.match(reply('Hur funkar Blind 10?', 'A'), /dela potten/);
  assert.match(reply('Hur funkar minispelen?', 'A'), /samma telefon/);
  const src = readFileSync(new URL('../server/support.js', import.meta.url), 'utf8');
  assert.match(src, /spelar ni på samma telefon gör ni upp sinsemellan/);
  const { getSupportMode } = await import('../server/support.js');
  const before = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(getSupportMode(), 'offline');
  if (before !== undefined) process.env.GEMINI_API_KEY = before;
});
