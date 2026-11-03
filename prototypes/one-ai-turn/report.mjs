// PROTOTYPE — renders the newest runs/battery-*.json (or the battery files named as args, merged as
// runs A, B, … and grouped by model) as a side-by-side reader at runs/report.html (gitignored).
// Served by server.mjs at /report. Run: node prototypes/one-ai-turn/report.mjs [battery-….json …]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './turn.mjs';
import { analyze } from './analyze.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const runs = path.join(dir, 'runs');
const picked = process.argv.length > 2
  ? process.argv.slice(2).map((f) => path.basename(f))
  : [fs.readdirSync(runs).filter((f) => /^battery-.*\.json$/.test(f)).sort().pop()];
const loaded = picked.map((f) => JSON.parse(fs.readFileSync(path.join(runs, f), 'utf8')));
const tag = (i) => (picked.length > 1 ? ` · run ${String.fromCharCode(65 + i)}` : '');
const order = [...new Set(loaded.flatMap((x) => x.results.map((r) => r.modelKey)))];
const b = {
  ...loaded[0],
  results: loaded.flatMap((x, i) => x.results.map((r) => ({ ...r, run: tag(i) })))
    .sort((p, q) => order.indexOf(p.modelKey) - order.indexOf(q.modelKey)),
};
const latest = picked.join(' + ');
const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
const label = (r) => `${MODELS[r.modelKey].label} — ${r.shape === 'split' ? 'Narrator + speakers' : 'one call'}${r.run || ''}`;

const cell = (r, t, i, ti) => {
  if (!t) return '<td></td>';
  const parts = (t.parts || []).map((p) => (p.kind === 'speech' ? `<p><b>${esc(p.name)}</b> — ${fmt(p.text)}</p>` : `<p class="n">${fmt(p.text)}</p>`)).join('');
  const a = t.judge?.applied;
  const j = a
    ? [...a.bonds.map((x) => `Bond ${esc(x.key.replace('->', ' → '))}: ${esc(x.before)} ⇒ <b>${esc(x.after)}</b>`),
       ...a.arcs.map((x) => `Arc ${esc(x.character)}: <b>${esc(x.step)}</b>`),
       a.sceneMoved ? '<b>Scene moves on</b>' : ''].filter(Boolean).join('<br>')
    : '';
  return `<td><div class="meta">$${(t.cost || 0).toFixed(4)} · ${((t.latencyMs || 0) / 1000).toFixed(1)}s${t.flags?.length ? ` · <span class="w">${esc(t.flags.join('; '))}</span>` : ''}</div>${parts}
    ${j ? `<div class="j">${j}</div>` : ''}<button data-turn="${ti + 1}" data-cfg="${i}">best this turn</button></td>`;
};

const stats = analyze(b);
const row = (k, f) => `<tr><td class="u">${k}</td>${stats.map((a) => `<td>${f(a)}</td>`).join('')}</tr>`;
const summary = `<table class="sum"><tr><th style="width:190px">Numbers (heuristics point at turns to read)</th>${b.results.map((r) => `<th>${esc(label(r))}</th>`).join('')}</tr>
${[
  row('Turns played', (a) => `${a.turnsOk}/${b.script.length}${a.errors.length ? ` · <span class="w">${esc(a.errors.join('; '))}</span>` : ''}`),
  row('Cost per turn (+ judge)', (a) => `$${a.costPerTurn.toFixed(5)} + $${a.judgePerTurn.toFixed(5)}`),
  row('Monthly at 60 turns/day', (a) => `<b>$${a.monthly.toFixed(2)}</b> (battery prompt sizes, ~${a.inTokMean} in / ${a.outTokMean} out tokens)`),
  row('Latency mean · median · max', (a) => `${a.latencyMeanS}s · ${a.latencyMedianS}s · ${a.latencyMaxS}s`),
  row('Words per turn', (a) => `${a.wordsMean} (${a.wordsRange.join('–')})`),
  row('Speakers per turn · turns each spoke in', (a) => `${a.speakersPerTurnMean} · ${Object.entries(a.speakerCounts).map(([k, v]) => `${k} ${v}`).join(', ')}`),
  row('Refusal / fade-to-black hits (turns 1–5)', (a) => `${a.refusals.length ? 'refusal T' + a.refusals.join(', T') : 'no refusal'} · ${a.fades.length ? 'fade wording T' + a.fades.join(', T') : 'no fade wording'}`),
  row('Garbled tokens (stray non-Latin script)', (a) => (a.garbled.length ? `<span class="w">T${a.garbled.join(', T')}</span>` : 'none')),
  row('Acting for Ash: <code>@Ash:</code> lines cut', (a) => String(a.roleCuts)),
  row('Acting for Ash: narration hits', (a) => a.thoughtHits.length ? `${a.thoughtHits.length}<br><span class="meta">${a.thoughtHits.map(esc).join('<br>')}</span>` : '0'),
  row('Format: bare "Name:" lines · quoted dialogue in narration · unknown speakers', (a) => `${a.bareNameLines} · ${a.quotedInNarration} turns · ${a.unknownSpeakers}`),
  row('Flags', (a) => a.flags.length ? `<span class="w">${a.flags.map(esc).join('<br>')}</span>` : 'none'),
].join('')}</table>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Turn battery — side by side</title><style>
body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#faf9f7;color:#1d1b19}
header{padding:12px 16px;background:#fff;border-bottom:1px solid #e6e2dc}h1{font-size:17px;margin:0}
table{border-collapse:collapse;table-layout:fixed;width:max(100%,${190 + 420 * b.results.length}px)}th,td{vertical-align:top;border:1px solid #e6e2dc;padding:8px 10px}
th{position:sticky;top:0;background:#fff;font-size:13px}td.u{background:#efeaff;font-size:13px}
p{margin:4px 0;white-space:pre-wrap}p.n{font-style:italic;color:#3d3a36}b{color:#7a4fd6}
.meta{font-size:11.5px;color:#6b665f}.w{color:#b4461f}.j{font-size:12px;background:#fff6d6;padding:4px 6px;border-radius:6px;margin-top:6px}
table.sum{margin-bottom:14px}table.sum td{font-size:13px}
button{font-size:11.5px;margin-top:6px;border:1px solid #e6e2dc;background:#fff;border-radius:6px;cursor:pointer}button.on{background:#7a4fd6;color:#fff}
</style></head><body><header><h1>Turn battery — same ${b.script.length} lines for Ash, ${b.results.length} setups</h1>
<div class="meta">${esc(latest)} · yellow = what V4 Flash judged changed after that turn · click "best this turn" to log your pick</div></header>
${summary}
<table><tr><th style="width:190px">Ash (probe)</th>${b.results.map((r) => `<th>${esc(label(r))}</th>`).join('')}</tr>
${b.script.map((s, ti) => `<tr><td class="u"><div class="meta">${ti + 1}. ${esc(s.probe)}</div>${fmt(s.text)}</td>${b.results.map((r, i) => cell(r, r.turns[ti], i, ti)).join('')}</tr>`).join('')}
</table><script>
const cfgs=${JSON.stringify(b.results.map(label))};
document.addEventListener('click',e=>{const t=e.target.closest('button[data-turn]');if(!t)return;
document.querySelectorAll('button[data-turn="'+t.dataset.turn+'"]').forEach(x=>x.classList.remove('on'));t.classList.add('on');
fetch('/api/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'report-pick',battery:${JSON.stringify(latest)},turn:Number(t.dataset.turn),best:cfgs[t.dataset.cfg]})});});
</script></body></html>`;
fs.writeFileSync(path.join(runs, 'report.html'), html);
console.log('wrote runs/report.html from', latest);
