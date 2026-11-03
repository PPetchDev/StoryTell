// PROTOTYPE — throwaway. Tiny local server: serves the page and proxies OpenRouter so the key
// never reaches the browser. Run from the repo root:  node prototypes/one-ai-turn/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './turn.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of [path.join(dir, '.env'), path.join(dir, '../../.env')]) try { process.loadEnvFile(f); } catch {}
const PORT = Number(process.env.PORT || 5177);
const runsDir = path.join(dir, 'runs');
fs.mkdirSync(runsDir, { recursive: true });
const logFile = path.join(runsDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
const log = (rec) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...rec }) + '\n');

async function callModel(model, req, purpose) {
  const body = {
    model: model.id,
    messages: req.messages,
    max_tokens: req.max_tokens,
    temperature: purpose === 'judge' ? 0.2 : 0.85,
    provider: { only: [model.host], allow_fallbacks: false },
    reasoning: model.reasoning || { enabled: false },
    usage: { include: true },
  };
  if (req.stop?.length) body.stop = req.stop;
  if (req.response_format) body.response_format = req.response_format;
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'Storytell AI turn prototype',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const latencyMs = Date.now() - t0;
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    return { purpose, model: model.label, latencyMs, error: msg, request: req.messages };
  }
  const ch = json.choices?.[0] || {};
  return {
    purpose,
    model: model.label,
    servedBy: json.provider,
    latencyMs,
    finish: ch.finish_reason,
    nativeFinish: ch.native_finish_reason,
    usage: json.usage,
    cost: json.usage?.cost ?? 0,
    text: ch.message?.content ?? '',
    request: req.messages,
  };
}

async function playTurn({ story, state, userText, modelKey, shape, ownBondsOnly }) {
  const model = T.MODELS[modelKey];
  const opts = { stopSupported: model.stop, ownBondsOnly };
  const calls = [];
  let parts = [];
  const flags = [];
  if (shape === 'single') {
    const c = await callModel(model, T.buildSingleCall(story, state, userText, opts), 'whole turn');
    calls.push(c);
    if (!c.error) {
      const p = T.parseSingle(story, c.text);
      parts = p.parts;
      flags.push(...p.flags);
    }
  } else {
    const n = await callModel(model, T.buildNarratorCall(story, state, userText, opts), 'narrator');
    calls.push(n);
    if (!n.error) {
      const p = T.parseNarrator(story, n.text);
      if (p.speakersLineMissing) flags.push('Narrator gave no SPEAKERS line');
      if (p.unknown.length) flags.push(`Narrator named unknown speakers: ${p.unknown.join(', ')}`);
      if (p.narration) parts.push({ kind: 'narration', text: p.narration });
      for (const name of p.speakers) {
        const soFar = T.partsToText(parts);
        const c = await callModel(model, T.buildCharacterCall(story, state, userText, name, soFar, opts), `character: ${name}`);
        calls.push(c);
        if (c.error) continue;
        const cl = T.cleanCharacterReply(story, name, c.text);
        flags.push(...cl.flags);
        parts.push({ kind: 'speech', name, text: cl.text });
      }
    }
  }
  for (const c of calls) {
    if (c.error) flags.push(`${c.purpose}: ${c.error}`);
    if (c.finish === 'content_filter') flags.push(`${c.purpose}: blocked by content filter`);
    if (c.finish === 'length') flags.push(`${c.purpose}: hit max tokens`);
  }
  return {
    modelKey,
    shape,
    parts,
    text: T.partsToText(parts),
    flags,
    calls,
    cost: calls.reduce((s, c) => s + (c.cost || 0), 0),
    latencyMs: calls.reduce((s, c) => s + c.latencyMs, 0),
  };
}

async function judge({ story, state, userText, aiText }) {
  const call = await callModel(T.JUDGE_MODEL, T.buildJudgeCall(story, state, userText, aiText), 'judge');
  const judgement = call.error ? { bond_changes: [], arc_steps: [], scene: { move_on: false }, error: call.error } : T.parseJudge(call.text);
  return { judgement, call };
}

const readBody = (req) => new Promise((ok) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => ok(s ? JSON.parse(s) : {})); });
const send = (res, code, data, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
};
const files = { '/': 'index.html', '/turn.mjs': 'turn.mjs', '/story.json': 'story.json', '/report': 'runs/report.html' };
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json' };

http
  .createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && files[req.url]) {
        const f = files[req.url];
        return send(res, 200, fs.readFileSync(path.join(dir, f), 'utf8'), types[path.extname(f)]);
      }
      if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, { keySet: !!process.env.OPENROUTER_API_KEY, logFile });
      if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
      const body = await readBody(req);
      if (req.url === '/api/note') { log({ type: 'note', ...body }); return send(res, 200, { ok: true }); }
      if (!process.env.OPENROUTER_API_KEY) return send(res, 400, { error: 'OPENROUTER_API_KEY is not set' });
      if (req.url === '/api/turn') {
        const out = await playTurn(body);
        log({ type: 'turn', turn: body.turn, userText: body.userText, ownBondsOnly: body.ownBondsOnly, ...out });
        return send(res, 200, out);
      }
      if (req.url === '/api/judge') {
        const out = await judge(body);
        log({ type: 'judge', turn: body.turn, ...out });
        return send(res, 200, out);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: String(e?.stack || e) });
    }
  })
  .listen(PORT, () => console.log(`Turn prototype on http://localhost:${PORT}  (key ${process.env.OPENROUTER_API_KEY ? 'found' : 'MISSING'})`));
