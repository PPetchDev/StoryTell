// PROTOTYPE — renders the newest runs/battery-*.json as a side-by-side reader at runs/report.html
// (gitignored). Served by server.mjs at /report. Run: node prototypes/one-ai-turn/report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './turn.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const runs = path.join(dir, 'runs');
const latest = fs.readdirSync(runs).filter((f) => /^battery-.*\.json$/.test(f)).sort().pop();
const b = JSON.parse(fs.readFileSync(path.join(runs, latest), 'utf8'));
const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
const label = (r) => `${MODELS[r.modelKey].label} — ${r.shape === 'split' ? 'Narrator + speakers' : 'one call'}`;

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

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Turn battery — side by side</title><style>
body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#faf9f7;color:#1d1b19}
header{padding:12px 16px;background:#fff;border-bottom:1px solid #e6e2dc}h1{font-size:17px;margin:0}
table{border-collapse:collapse;table-layout:fixed;width:max(100%,1500px)}th,td{vertical-align:top;border:1px solid #e6e2dc;padding:8px 10px}
th{position:sticky;top:0;background:#fff;font-size:13px}td.u{background:#efeaff;font-size:13px}
p{margin:4px 0;white-space:pre-wrap}p.n{font-style:italic;color:#3d3a36}b{color:#7a4fd6}
.meta{font-size:11.5px;color:#6b665f}.w{color:#b4461f}.j{font-size:12px;background:#fff6d6;padding:4px 6px;border-radius:6px;margin-top:6px}
button{font-size:11.5px;margin-top:6px;border:1px solid #e6e2dc;background:#fff;border-radius:6px;cursor:pointer}button.on{background:#7a4fd6;color:#fff}
</style></head><body><header><h1>Turn battery — same ${b.script.length} lines for Ash, four setups</h1>
<div class="meta">${esc(latest)} · yellow = what V4 Flash judged changed after that turn · click "best this turn" to log your pick</div></header>
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
