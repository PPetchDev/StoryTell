// PROTOTYPE — throwaway. Ticket 18: does Venice draw explicit fictional-adult images and keep
// one Character's face from a Reference image? (Runware was dropped: $20 minimum top-up.)
// Run from the repo root (Node 22+, no install):
//   node prototypes/image-check/check.mjs --dry-run                 print the requests, spend nothing
//   node prototypes/image-check/check.mjs                           reference image + every scene (~$0.20)
//   node prototypes/image-check/check.mjs --ref <file>              reuse an existing reference image
//   node prototypes/image-check/check.mjs --edit-model seedream-v4-edit   compare another edit model
// Prompts and models live in check.json. Images land in out/<run>/ (gitignored) with index.html.
// Venice API per https://docs.venice.ai/swagger.yaml, /api-reference/endpoint/image/{generate,multi-edit},
// /api-reference/endpoint/billing/balance and /api-reference/error-codes (read 2026-11-03).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of [path.join(dir, '.env'), path.join(dir, '../../.env')]) try { process.loadEnvFile(f); } catch {}

const API = process.env.VENICE_API_URL || 'https://api.venice.ai/api/v1'; // override only to test against a mock
const KEY = process.env.VENICE_API_KEY || process.env.VENICE_INFERENCE_KEY;
// List prices per image from https://docs.venice.ai/overview/pricing; the API reports no per-image cost.
const LIST_PRICE = { 'qwen-image': 0.03, 'qwen-image-3': 0.04, 'seedream-v4': 0.05, 'qwen-edit-uncensored': 0.04, 'seedream-v4-edit': 0.05 };

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dryRun = args.includes('--dry-run');
const refArg = flag('--ref');

const check = JSON.parse(fs.readFileSync(path.join(dir, 'check.json'), 'utf8'));
const REF_MODEL = check.models.reference;
const EDIT_MODEL = flag('--edit-model') || check.models.edit;
const STYLE = flag('--style') || 'photo';
const imageStyle = check.styles[STYLE];
if (!imageStyle) {
  console.error(`Unknown --style "${STYLE}". check.json has: ${Object.keys(check.styles).join(', ')}`);
  process.exit(1);
}
const fill = (t) =>
  t.replaceAll('{name}', check.character.name).replaceAll('{appearance}', check.character.appearance).replaceAll('{imageStyle}', imageStyle);

if (!dryRun && !KEY) {
  console.error('VENICE_API_KEY is not set. Put it in prototypes/image-check/.env (gitignored) or the environment.');
  process.exit(1);
}

const referenceBody = () => ({
  model: REF_MODEL,
  prompt: fill(check.referencePrompt),
  aspect_ratio: '2:3', // Qwen Image models reject width/height
  format: 'jpeg',
  safe_mode: false,
  hide_watermark: true,
  return_binary: false,
  variants: 1,
});

const sceneBody = (scene, refBase64) => ({
  modelId: EDIT_MODEL,
  prompt: `${check.editPrefix} ${fill(scene.prompt)}`,
  images: [refBase64], // the first image is the base; here it is the Character's reference
  aspect_ratio: '2:3',
  output_format: 'jpeg',
  safe_mode: false,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 429 (rate limit) and 503 (model at capacity) are rejections before inference, so retrying them
// can't pay twice. Anything else, including a network error mid-request, is reported, not resent.
async function call(method, pathname, body) {
  const t0 = Date.now();
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}${pathname}`, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      return { error: `network error: ${e.message} (a generation may still have been billed)`, seconds: (Date.now() - t0) / 1000 };
    }
    if ((res.status === 429 || res.status === 503) && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** (attempt - 1);
      console.log(`  ${pathname}: HTTP ${res.status}, retrying in ${Math.round(wait / 1000)} s`);
      await sleep(wait);
      continue;
    }
    const type = res.headers.get('content-type') || '';
    const flags = {
      blurred: res.headers.get('x-venice-is-blurred') === 'true',
      violation: res.headers.get('x-venice-is-content-violation') === 'true',
    };
    const seconds = (Date.now() - t0) / 1000;
    if (res.ok && type.startsWith('image/')) return { bytes: Buffer.from(await res.arrayBuffer()), ...flags, seconds };
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = json.details ? ` ${JSON.stringify(json.details)}` : '';
      return { error: `HTTP ${res.status}: ${json.error || res.statusText}${detail}`, seconds };
    }
    return { json, ...flags, seconds };
  }
}

async function balance() {
  const r = await call('GET', '/billing/balance');
  if (r.error) return { text: `unavailable (${r.error})` };
  const b = r.json?.balances;
  if (!b) return { text: `unrecognised shape: ${JSON.stringify(r.json)}` };
  const usd = b.usd ?? 0; // null means zero
  return { usd, text: `$${usd} USD, ${b.diem ?? 0} DIEM, canConsume=${r.json.canConsume}` };
}

const short = (body) => JSON.stringify(body, (k, v) => (k === 'images' ? v.map(() => '<reference image, base64>') : v), 2);

if (dryRun) {
  console.log(`POST ${API}/image/generate\n${short(referenceBody())}`);
  for (const s of check.scenes) console.log(`\nPOST ${API}/image/multi-edit  (scene "${s.id}")\n${short(sceneBody(s, ''))}`);
  const est = (refArg ? 0 : LIST_PRICE[REF_MODEL] ?? 0) + check.scenes.length * (LIST_PRICE[EDIT_MODEL] ?? 0);
  console.log(`\n${(refArg ? 0 : 1) + check.scenes.length} images would be generated (~$${est.toFixed(2)} at list price). Nothing was sent.`);
  process.exit(0);
}

const outDir = path.join(dir, 'out', `${new Date().toISOString().replace(/[:.]/g, '-')}-${STYLE}-${EDIT_MODEL}`);
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
const before = await balance();
console.log(`Balance before: ${before.text}`);

let refBase64;
if (refArg) {
  const bytes = fs.readFileSync(path.resolve(refArg));
  refBase64 = bytes.toString('base64');
  fs.writeFileSync(path.join(outDir, 'reference.jpg'), bytes);
  rows.push({ id: 'reference', file: 'reference.jpg', note: `reused ${refArg}` });
  console.log(`Reusing reference image ${refArg}`);
} else {
  const body = referenceBody();
  console.log(`Generating the reference image with ${REF_MODEL}…`);
  const r = await call('POST', '/image/generate', body);
  const b64 = r.json?.images?.[0];
  if (r.error || !b64) {
    console.error(`Reference image failed: ${r.error || `no image in response ${JSON.stringify(r.json)}`}`);
    process.exit(1);
  }
  refBase64 = b64;
  fs.writeFileSync(path.join(outDir, 'reference.jpg'), Buffer.from(b64, 'base64'));
  rows.push({
    id: 'reference', file: 'reference.jpg', model: REF_MODEL, prompt: body.prompt, listPrice: LIST_PRICE[REF_MODEL],
    blurred: r.blurred, violation: r.violation || (r.json.content_policy_violation_count ?? 0) > 0, seconds: r.seconds,
  });
}

console.log(`Generating ${check.scenes.length} scenes with ${EDIT_MODEL}…`);
const results = await Promise.all(check.scenes.map((s) => call('POST', '/image/multi-edit', sceneBody(s, refBase64))));
for (const [i, s] of check.scenes.entries()) {
  const r = results[i];
  const row = { id: s.id, model: EDIT_MODEL, prompt: sceneBody(s, '').prompt, seconds: r.seconds };
  if (r.error) row.error = r.error;
  else if (!r.bytes) row.error = `expected image bytes, got ${JSON.stringify(r.json)}`;
  else {
    row.file = `${s.id}.jpg`;
    fs.writeFileSync(path.join(outDir, row.file), r.bytes);
    Object.assign(row, { listPrice: LIST_PRICE[EDIT_MODEL], blurred: r.blurred, violation: r.violation });
  }
  rows.push(row);
}

const after = await balance();
console.log(`Balance after: ${after.text}`);
const spent = before.usd !== undefined && after.usd !== undefined ? +(before.usd - after.usd).toFixed(4) : null;
const listTotal = +rows.reduce((t, r) => t + (r.listPrice || 0), 0).toFixed(4);
const summary = spent !== null ? `spent $${spent} by balance (list price $${listTotal})` : `list price $${listTotal}`;
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ style: STYLE, referenceModel: REF_MODEL, editModel: EDIT_MODEL, spent, listTotal, rows }, null, 2));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const marks = (r) => [r.blurred && 'BLURRED', r.violation && 'CONTENT VIOLATION'].filter(Boolean).join(' · ');
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Image check</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
figure{margin:0}img{width:100%;border-radius:6px}figcaption{opacity:.8;margin-top:4px}.err{color:#f88}</style>
<h1>${esc(STYLE)}: ${esc(REF_MODEL)} → ${esc(EDIT_MODEL)} — ${esc(summary)}</h1><main>${rows
    .map(
      (r) => `<figure>${r.file ? `<img src="${esc(r.file)}">` : `<p class="err">${esc(r.error)}</p>`}<figcaption><b>${esc(r.id)}</b>
 <span class="err">${esc(marks(r))}</span> · ${r.seconds ? `${r.seconds.toFixed(0)} s` : ''}<br>${esc(r.prompt || r.note)}</figcaption></figure>`,
    )
    .join('')}</main>`,
);

console.log('\n id          seconds  result');
for (const r of rows) {
  const result = r.error ? `FAILED ${r.error}` : `${r.file} ${marks(r)}`;
  console.log(` ${r.id.padEnd(11)} ${String(r.seconds ? r.seconds.toFixed(0) : '–').padEnd(8)} ${result}`);
}
console.log(`\n${summary[0].toUpperCase()}${summary.slice(1)}. Open ${path.join(outDir, 'index.html')} to compare faces.`);
if (rows.some((r) => r.error || r.blurred || r.violation)) process.exitCode = 1;
