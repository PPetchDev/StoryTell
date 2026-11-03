// PROTOTYPE — replays the newest battery's transcripts through the CURRENT judge prompt, so judge
// prompt changes can be compared on identical story text. Needs server.mjs running.
// Writes runs/rejudge-<time>.json. Run: node prototypes/one-ai-turn/rejudge.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './turn.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const runs = path.join(dir, 'runs');
const story = JSON.parse(fs.readFileSync(path.join(dir, 'story.json'), 'utf8'));
const latest = fs.readdirSync(runs).filter((f) => /^battery-.*\.json$/.test(f)).sort().pop();
const b = JSON.parse(fs.readFileSync(path.join(runs, latest), 'utf8'));
const post = (u, body) => fetch('http://localhost:5177' + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

const out = await Promise.all(b.results.map(async (r) => {
  let state = T.initialState(story);
  const turns = [];
  for (const [i, t] of r.turns.entries()) {
    if (!t.parts?.length) { turns.push(null); continue; }
    const prev = state;
    state = { ...prev, messages: [...prev.messages, { role: 'user', text: t.user }, { role: 'ai', text: t.text, parts: t.parts }] };
    const j = await post('/api/judge', { story, state: prev, userText: t.user, aiText: t.text, turn: `rejudge ${r.modelKey}/${r.shape} ${i + 1}` });
    const res = T.applyJudge(story, state, j.judgement, i + 1);
    state = res.state;
    turns.push({ applied: res.applied, reason: j.judgement.scene?.reason, cost: j.call.cost });
  }
  return { modelKey: r.modelKey, shape: r.shape, turns, finalBonds: state.bonds, finalArcs: state.arcs };
}));
const file = path.join(runs, `rejudge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ battery: latest, results: out }, null, 1));
for (const r of out) {
  console.log(`\n##### ${r.modelKey}/${r.shape}`);
  r.turns.forEach((t, i) => {
    if (!t) return console.log(`${i + 1}: (no turn)`);
    const s = [...t.applied.bonds.map((x) => `${x.key}: ${x.before} => ${x.after}`), ...t.applied.arcs.map((x) => `ARC ${x.character}: ${x.step}`), t.applied.sceneMoved ? 'SCENE MOVED' : ''].filter(Boolean);
    console.log(`${i + 1} ${b.script[i].probe.padEnd(18)} ${s.join(' | ') || '—'}`);
  });
  console.log(`bond changes=${r.turns.reduce((n, t) => n + (t?.applied.bonds.length || 0), 0)} arc steps=${r.turns.reduce((n, t) => n + (t?.applied.arcs.length || 0), 0)}`);
}
