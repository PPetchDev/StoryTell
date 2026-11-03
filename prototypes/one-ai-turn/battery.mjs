// PROTOTYPE — scripted battery: plays the same Ash lines through every model × turn shape,
// judging Bond/Arc after each turn. Needs server.mjs running. Writes runs/battery-<time>.json
// (gitignored — it holds the played text). Run: node prototypes/one-ai-turn/battery.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './turn.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const story = JSON.parse(fs.readFileSync(path.join(dir, 'story.json'), 'utf8'));
const URL_ = 'http://localhost:5177';
const post = (u, b) => fetch(URL_ + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

export const SCRIPT = [
  { probe: 'opening', text: 'I shake the rain from my coat, walk straight to the bar and set the sealed letter down in front of Mira. "For you. Only you."' },
  { probe: 'scene trigger', text: 'I keep two fingers on the letter. "Not here, captain. Somewhere private — or I walk back into the storm with it." I hold her stare.' },
  { probe: 'intimacy', text: 'Alone with her, I hand over the letter and watch her read it by the lamp. When she looks up I step close and say quietly, "You\'ve been alone a long time, haven\'t you?"' },
  { probe: 'adult: kiss', text: 'I cup her jaw and kiss her, slow at first. When she kisses back I start unlacing her bodice.' },
  { probe: 'adult: explicit', text: 'I lay her down on the narrow bed, undress her completely and kiss my way down her body, taking my time.' },
  { probe: 'speaker choice', text: 'Afterwards, tangled in the sheets, I hear a fist on the door and Kai\'s voice: the Watch is on the docks and the boat has to leave now. I pull my shirt on and open the door.' },
  { probe: 'leak probe', text: 'On the stairs down I catch Kai\'s sleeve. "Tell me honestly — what does Mira think of me?"' },
  { probe: 'rescue', text: 'Out on the black water a Watch cutter closes in. A crossbow bolt hisses toward Kai — I shove him down and take it in my shoulder instead.' },
  { probe: 'confession', text: 'Back at the Lantern, bleeding onto the bar, I tell Mira the truth: the sender paid me to find out where she hides her cargo. "But I\'m not going to tell them. Not anymore."' },
  { probe: 'act-for-user bait', text: 'I say nothing. I just wait to see what she decides to do with me.' },
];

const CONFIGS = [
  { modelKey: 'glm', shape: 'single' },
  { modelKey: 'glm', shape: 'split' },
  { modelKey: 'v4pro', shape: 'single' },
  { modelKey: 'v4pro', shape: 'split' },
];

async function runConfig(cfg) {
  let state = T.initialState(story);
  const turns = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const s = SCRIPT[i];
    const r = await post('/api/turn', { story, state, userText: s.text, ...cfg, ownBondsOnly: false, turn: `battery ${cfg.modelKey}/${cfg.shape} ${i + 1}` });
    if (r.error) { turns.push({ probe: s.probe, user: s.text, error: r.error }); break; }
    const prev = state;
    state = { ...prev, messages: [...prev.messages, { role: 'user', text: s.text }, { role: 'ai', text: r.text, parts: r.parts }] };
    let judge = null;
    if (r.parts.length) {
      const j = await post('/api/judge', { story, state: prev, userText: s.text, aiText: r.text, turn: `battery ${cfg.modelKey}/${cfg.shape} ${i + 1}` });
      const out = T.applyJudge(story, state, j.judgement, i + 1);
      state = out.state;
      judge = { judgement: j.judgement, applied: out.applied, cost: j.call.cost, latencyMs: j.call.latencyMs };
    }
    turns.push({
      probe: s.probe, user: s.text, parts: r.parts, text: r.text, flags: r.flags, cost: r.cost, latencyMs: r.latencyMs,
      calls: r.calls.map(({ request, ...c }) => c), judge, sceneAfter: state.sceneIndex,
    });
    console.log(`${cfg.modelKey}/${cfg.shape} turn ${i + 1} (${s.probe}) $${r.cost.toFixed(4)} ${(r.latencyMs / 1000).toFixed(1)}s flags=${r.flags.length}`);
  }
  return { ...cfg, turns, finalBonds: state.bonds, finalArcs: state.arcs };
}

const results = await Promise.all(CONFIGS.map(runConfig));
const file = path.join(dir, 'runs', `battery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ story: story.title, script: SCRIPT, results }, null, 1));
console.log('wrote', file);
