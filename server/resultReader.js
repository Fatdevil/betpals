// ── Read a game's result from a photo (scorecard, GameBook leaderboard, …) ──
// Gemini looks at the picture and names which of the game's options won. It is only a
// suggestion: the organiser still confirms, and without a key nothing is read at all.
import * as db from './db.js';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const PER_MODEL_TIMEOUT_MS = 12000;
const TOTAL_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function apiKey() {
  return (process.env.GEMINI_API_KEY || (db.getSetting ? db.getSetting('gemini_api_key') : null) || '').trim();
}

export function canReadResults() {
  return Boolean(apiKey());
}

// data:image/jpeg;base64,... → { mimeType, data }
export function parseImageDataUrl(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  if (Math.floor(m[2].length * 3 / 4) > MAX_IMAGE_BYTES) return null;
  return { mimeType: m[1], data: m[2] };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// "Anna Andersson" on the card for the option "Anna": the longest option inside the name
// wins (Jonas, not Jon). A short name inside several options ("Jon" in Jonas and Jonathan)
// is ambiguous and matches nothing. Never for short options like 1/X/2.
function looseMatch(n, options) {
  if (n.length < 3) return null;
  const named = options.map(o => ({ o, on: norm(o.name) })).filter(x => x.on.length >= 3);
  const inside = named.filter(x => n.includes(x.on)).sort((a, b) => b.on.length - a.on.length);
  const around = named.filter(x => x.on.includes(n) && x.on !== n);
  if (inside.length) {
    // "Jona" holds Jon but is also the start of Jonas: could be either, so no guess
    if (around.length) return null;
    return inside.length > 1 && inside[0].on.length === inside[1].on.length ? null : inside[0].o;
  }
  return around.length === 1 ? around[0].o : null;
}

function exactOnly(raw, options) {
  const want = String(raw).trim().toLowerCase();
  const hits = options.filter(o => String(o.name).trim().toLowerCase() === want);
  return hits.length === 1 ? hits[0] : null;
}

// The names the model gave, matched to the game's own options (never anything else)
export function matchOptions(names, options) {
  const ids = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const n = norm(raw);
    if (!n) continue;
    // André and Andre both read "andre": only the exact spelling tells them apart
    const same = options.filter(o => norm(o.name) === n);
    const hit = same.length > 1
      ? exactOnly(raw, same)
      : same[0] || looseMatch(n, options);
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

function buildPrompt(event, count) {
  const list = event.players.map(p => `- ${p.name}`).join('\n');
  const task = count
    ? `Spelet frågar: "${event.name}". Välj exakt ${count} alternativ som enligt bilden är svaret på frågan.`
    : `Spelet heter "${event.name}". Välj det alternativ som vann enligt bilden (vid delad seger: alla som delar förstaplatsen).`;
  return `Du läser av resultatet på en bild av ett scorekort eller en topplista (t.ex. från GameBook). Tolka rangordningen som bilden visar: i slagspel vinner lägst antal slag, i poängbogey/stableford flest poäng.

Spelets alternativ:
${list}

${task}
Använd ENDAST namn från listan ovan, stavade exakt som där. Om bilden inte går att läsa eller inte gäller spelet: lämna winners tom.
Svara med JSON: {"winners": ["namn", ...], "reason": "kort förklaring på svenska, max 20 ord"}`;
}

/**
 * Returns { ok: true, winnerIds, reason } or { ok: false, error }.
 */
export async function readResultFromImage(event, imageDataUrl, { fetchImpl = fetch } = {}) {
  const key = apiKey();
  if (!key) return { ok: false, error: 'AI-avläsning är inte påslagen' };
  const image = parseImageDataUrl(imageDataUrl);
  if (!image) return { ok: false, error: 'Bilden kunde inte läsas' };
  const count = event.betMode === 'picks' ? (event.pickCount || 0) : 0;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: image.mimeType, data: image.data } },
        { text: buildPrompt(event, count) }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 300, responseMimeType: 'application/json' }
  };

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  for (const model of MODELS) {
    const timeLeft = deadline - Date.now();
    if (timeLeft < 1000) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(PER_MODEL_TIMEOUT_MS, timeLeft));
    try {
      // The key goes in a header, never in the URL
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
      let parsed = null;
      try { parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { continue; }
      let winnerIds = matchOptions(parsed?.winners, event.players);
      if (count && winnerIds.length !== count) winnerIds = winnerIds.slice(0, count);
      return { ok: true, winnerIds, reason: String(parsed?.reason || '').slice(0, 200) };
    } catch {
      // timeout or network: try the next model
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: 'Kunde inte läsa av bilden just nu – välj vinnaren själv' };
}
