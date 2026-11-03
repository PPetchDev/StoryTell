// PROTOTYPE — per-setup numbers for a battery: cost, latency, length, speakers, format and
// "acted for the user" signals. Heuristic counts point at turns to read; they are not verdicts.
// Imported by report.mjs; run alone for a text summary:  node prototypes/one-ai-turn/analyze.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './turn.mjs';

const TURNS_PER_DAY = 60;
// Second person stating Ash's inner life (perception like "you see" is allowed by the rules).
const THOUGHT = /\byou (think|thought|feel(?! the| her| his| it| a| its)|felt(?! the| her| his| it| a)|wonder|realis|realiz|decide|want|need|know|can't help|find yourself|remember|hope|fear|suspect)\w*|\byour (heart|pulse|mind|thoughts?|chest tightens|breath catches)\b|\bAsh (thinks|feels|decides|wonders|realizes|smiles|nods|says|whispers|pulls|kisses|moves|reaches|steps|leans)\b/gi;
// Out-of-character refusals only — a Character saying "I can't" in the story is not one.
const REFUSAL = /\b(as an AI|I can(?:no|')t (write|continue|help with|create|produce)|I'm (sorry|not able|unable)[^.]{0,40}(write|continue|content)|keep (this|things) (PG|tasteful))\b/i;
// Stray non-Latin script inside English prose = garbled tokens.
const GARBLE = /[Ѐ-ӿ֐-ۿ฀-๿぀-鿿가-힯]/;
const FADE = /\b(fade[sd]? to black|the rest is history|later that night|hours later|the next morning|afterwards,|when it'?s over)\b/i;
const BARE_NAME = (names) => new RegExp(`^\\s*\\**(${names.join('|')})\\**\\s*:`, 'm');

const words = (s = '') => (s.match(/\S+/g) || []).length;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

export function analyze(b, names = ['Mira', 'Kai', 'Oren']) {
  return b.results.map((r) => {
    const turns = r.turns.filter((t) => !t.error);
    const calls = turns.flatMap((t) => t.calls || []);
    const thoughtHits = [];
    const fades = [];
    const refusals = [];
    const garbled = [];
    let bareNameLines = 0, quotedInNarration = 0, roleCuts = 0, unknownSpeakers = 0;
    const speakerCounts = Object.fromEntries(names.map((n) => [n, 0]));
    const speakersPerTurn = [];
    turns.forEach((t, i) => {
      const n = r.turns.indexOf(t) + 1;
      const narr = (t.parts || []).filter((p) => p.kind === 'narration').map((p) => p.text).join('\n');
      for (const m of narr.matchAll(THOUGHT)) thoughtHits.push(`T${n}: "${narr.slice(Math.max(0, m.index - 40), m.index + 50).replace(/\s+/g, ' ')}"`);
      if (REFUSAL.test(t.text)) refusals.push(n);
      if (GARBLE.test(t.text)) garbled.push(n);
      if (FADE.test(t.text) && n <= 5) fades.push(n);
      if (BARE_NAME(names).test(narr)) bareNameLines++;
      if (/["“][^"”]{3,}["”]/.test(narr)) quotedInNarration++;
      roleCuts += (t.flags || []).filter((f) => /user’s Role/.test(f)).length;
      unknownSpeakers += (t.flags || []).filter((f) => /Unknown speaker/.test(f)).length;
      const who = new Set((t.parts || []).filter((p) => p.kind === 'speech').map((p) => p.name));
      speakersPerTurn.push(who.size);
      for (const w of who) if (w in speakerCounts) speakerCounts[w]++;
    });
    const turnCost = turns.map((t) => t.cost || 0);
    const judgeCost = turns.map((t) => t.judge?.cost || 0);
    const lat = turns.map((t) => t.latencyMs || 0);
    const inTok = calls.map((c) => c.usage?.prompt_tokens || 0);
    const outTok = calls.map((c) => c.usage?.completion_tokens || 0);
    const reasoningTok = calls.map((c) => c.usage?.completion_tokens_details?.reasoning_tokens || 0);
    const perTurn = mean(turnCost) + mean(judgeCost);
    return {
      setup: `${MODELS[r.modelKey].label} — ${r.shape === 'split' ? 'split' : 'one call'}`,
      modelKey: r.modelKey,
      turnsOk: turns.length,
      errors: r.turns.filter((t) => t.error).map((t) => t.error),
      flags: turns.flatMap((t, i) => (t.flags || []).map((f) => `T${r.turns.indexOf(t) + 1}: ${f}`)),
      finishes: calls.map((c) => c.finish),
      refusals, fades, garbled,
      wordsMean: Math.round(mean(turns.map((t) => words(t.text)))),
      wordsRange: [Math.min(...turns.map((t) => words(t.text))), Math.max(...turns.map((t) => words(t.text)))],
      speakersPerTurnMean: +mean(speakersPerTurn).toFixed(1),
      speakerCounts,
      roleCuts, thoughtHits, bareNameLines, quotedInNarration, unknownSpeakers,
      latencyMeanS: +(mean(lat) / 1000).toFixed(1), latencyMedianS: +(median(lat) / 1000).toFixed(1), latencyMaxS: +(Math.max(...lat) / 1000).toFixed(1),
      inTokMean: Math.round(mean(inTok)), outTokMean: Math.round(mean(outTok)), reasoningTokTotal: reasoningTok.reduce((x, y) => x + y, 0),
      costPerTurn: mean(turnCost), judgePerTurn: mean(judgeCost),
      monthly: perTurn * TURNS_PER_DAY * 30,
    };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const runs = path.join(dir, 'runs');
  const file = process.argv[2] || fs.readdirSync(runs).filter((f) => /^battery-.*\.json$/.test(f)).sort().pop();
  const b = JSON.parse(fs.readFileSync(path.join(runs, path.basename(file)), 'utf8'));
  console.log(file);
  for (const a of analyze(b)) console.log(JSON.stringify(a, null, 1));
}
