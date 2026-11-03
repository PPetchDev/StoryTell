// PROTOTYPE — throwaway. Ticket 18: does Seedream 4 on Runware draw explicit fictional-adult
// images and keep one Character's face from a Reference image?
// Run from the repo root (Node 22+, no install):
//   node prototypes/image-check/check.mjs --dry-run      print the requests, spend nothing
//   node prototypes/image-check/check.mjs                reference image + every scene (~$0.15)
//   node prototypes/image-check/check.mjs --ref <file>   reuse an existing reference image
// Prompts live in check.json. Images land in out/<run>/ (gitignored) with index.html to compare.
// Runware API per https://runware.ai/docs/models/bytedance-seedream-4-0 and /docs/models-api/*.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of [path.join(dir, '.env'), path.join(dir, '../../.env')]) try { process.loadEnvFile(f); } catch {}

const API = process.env.RUNWARE_API_URL || 'https://api.runware.ai/v1'; // override only to test against a mock
const MODEL = 'bytedance:5@0'; // Seedream 4.0
const [WIDTH, HEIGHT] = [1664, 2496]; // Seedream 4.0's 2K 2:3 portrait size
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const refArg = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : null;
const KEY = process.env.RUNWARE_API_KEY;

if (!dryRun && !KEY) {
  console.error('RUNWARE_API_KEY is not set. Put it in prototypes/image-check/.env (gitignored) or the environment.');
  process.exit(1);
}

const check = JSON.parse(fs.readFileSync(path.join(dir, 'check.json'), 'utf8'));
const fill = (t) =>
  t.replaceAll('{name}', check.character.name).replaceAll('{appearance}', check.character.appearance).replaceAll('{imageStyle}', check.imageStyle);

function inferenceTask(prompt, referenceImages) {
  return {
    taskType: 'imageInference',
    taskUUID: randomUUID(),
    model: MODEL,
    positivePrompt: prompt,
    width: WIDTH,
    height: HEIGHT,
    numberResults: 1,
    outputType: 'URL',
    outputFormat: 'JPG',
    includeCost: true,
    safety: { checkContent: false }, // default isn't documented, so turn it off explicitly
    ...(referenceImages ? { inputs: { referenceImages } } : {}),
  };
}

// `transient` marks failures worth retrying (network, 429, 5xx) with how long to wait first.
async function post(tasks) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks),
    });
  } catch (e) {
    return { data: [], errors: [{ message: `network error: ${e.message}` }], transient: { waitMs: 0 } };
  }
  const json = await res.json().catch(() => ({}));
  // The docs show both `errors: [...]` and `error`; accept either.
  const errors = json.errors || (json.error ? [json.error] : []);
  if (!res.ok && !errors.length) errors.push({ message: `HTTP ${res.status}` });
  const retryAfter = Number(res.headers.get('retry-after') || errors.find((e) => e.retryAfter)?.retryAfter || 0);
  const transient = res.status === 429 || res.status >= 500 ? { waitMs: retryAfter * 1000 } : null;
  return { data: json.data || [], errors, transient };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One task in, its finished result out. A sync task past 120 s comes back "processing":
// poll getResponse with the same taskUUID (never resend the task — that pays twice).
// A transient failure while polling is retried; on the first send it is reported, because
// the task may already be running and resending it would pay twice.
async function run(task) {
  const t0 = Date.now();
  let { data, errors, transient } = await post([task]);
  let delay = 2000;
  let polling = false;
  for (;;) {
    const err = errors.find((e) => !e.taskUUID || e.taskUUID === task.taskUUID);
    const retry = polling && transient;
    if (err && !retry) {
      const hint = transient ? ' (the task may still be running and billed; check the Runware dashboard before rerunning)' : '';
      return { error: `${err.code || 'error'}: ${err.message || JSON.stringify(err)}${hint}`, taskUUID: task.taskUUID, seconds: (Date.now() - t0) / 1000 };
    }
    const hit = data.find((d) => d.taskUUID === task.taskUUID);
    if (hit && hit.status !== 'processing' && (hit.imageURL || hit.imageDataURI || hit.imageBase64Data)) {
      return { ...hit, seconds: (Date.now() - t0) / 1000 };
    }
    if (Date.now() - t0 > 6 * 60_000) return { error: 'gave up after 6 minutes still processing', taskUUID: task.taskUUID, seconds: (Date.now() - t0) / 1000 };
    await sleep(Math.max(delay, retry ? transient.waitMs : 0));
    delay = Math.min(delay * 1.5, 15000);
    polling = true;
    ({ data, errors, transient } = await post([{ taskType: 'getResponse', taskUUID: task.taskUUID }]));
  }
}

async function balance() {
  const { data, errors } = await post([{ taskType: 'accountManagement', taskUUID: randomUUID(), operation: 'getDetails' }]);
  if (errors.length) return `unavailable (${errors[0].message || errors[0].code})`;
  const b = data[0]?.balance;
  return b ? `${b.amount} ${b.currency || ''}`.trim() : 'unavailable';
}

async function save(result, file) {
  if (result.imageURL) {
    const res = await fetch(result.imageURL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  } else {
    const b64 = result.imageBase64Data || result.imageDataURI.split(',')[1];
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  }
}

const sceneTasks = (ref) => check.scenes.map((s) => ({ id: s.id, task: inferenceTask(fill(s.prompt), [ref]) }));

if (dryRun) {
  const refTask = inferenceTask(fill(check.referencePrompt));
  console.log('POST', API, '\n\nReference image:\n', JSON.stringify([refTask], null, 2));
  for (const { id, task } of sceneTasks('<reference imageURL or data URI>')) console.log(`\nScene "${id}":\n`, JSON.stringify([task], null, 2));
  console.log(`\n${1 + check.scenes.length} images would be generated (~$0.03 each). Nothing was sent.`);
  process.exit(0);
}

const outDir = path.join(dir, 'out', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
console.log(`Balance before: ${await balance()}`);

let ref;
if (refArg) {
  const file = path.resolve(refArg);
  ref = `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
  fs.copyFileSync(file, path.join(outDir, 'reference.jpg'));
  rows.push({ id: 'reference', file: 'reference.jpg', note: `reused ${refArg}`, cost: 0 });
  console.log(`Reusing reference image ${refArg}`);
} else {
  const task = inferenceTask(fill(check.referencePrompt));
  console.log('Generating the reference image…');
  const r = await run(task);
  if (r.error) {
    console.error(`Reference image failed: ${r.error}`);
    process.exit(1);
  }
  await save(r, path.join(outDir, 'reference.jpg'));
  ref = r.imageURL || r.imageDataURI || `data:image/jpeg;base64,${r.imageBase64Data}`;
  rows.push({ id: 'reference', file: 'reference.jpg', prompt: task.positivePrompt, cost: r.cost, nsfw: r.NSFWContent, seed: r.seed, seconds: r.seconds });
}

console.log(`Generating ${check.scenes.length} scenes with the reference…`);
const scenes = sceneTasks(ref);
const results = await Promise.all(scenes.map(({ task }) => run(task)));
for (const [i, { id, task }] of scenes.entries()) {
  const r = results[i];
  const row = { id, prompt: task.positivePrompt, seconds: r.seconds };
  if (r.error) row.error = r.error;
  else {
    Object.assign(row, { cost: r.cost, nsfw: r.NSFWContent, seed: r.seed });
    try {
      await save(r, path.join(outDir, `${id}.jpg`));
      row.file = `${id}.jpg`;
    } catch (e) {
      row.error = `paid but download failed (${e.message}); image URL: ${r.imageURL}`;
    }
  }
  rows.push(row);
}

const total = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
console.log(`Balance after: ${await balance()}`);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ model: MODEL, width: WIDTH, height: HEIGHT, total, rows }, null, 2));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Image check</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
figure{margin:0}img{width:100%;border-radius:6px}figcaption{opacity:.8;margin-top:4px}.err{color:#f88}</style>
<h1>${esc(MODEL)} — total $${total.toFixed(4)}</h1><main>${rows
    .map(
      (r) => `<figure>${r.file ? `<img src="${esc(r.file)}">` : `<p class="err">${esc(r.error)}</p>`}<figcaption><b>${esc(r.id)}</b>
 · $${esc(r.cost ?? '–')} · NSFW flag: ${esc(r.nsfw ?? '–')} · ${r.seconds ? `${r.seconds.toFixed(0)} s` : ''}<br>${esc(r.prompt || r.note)}</figcaption></figure>`,
    )
    .join('')}</main>`,
);

console.log('\n id          cost      NSFW   seconds  result');
for (const r of rows) {
  console.log(` ${r.id.padEnd(11)} ${String(r.cost ?? '–').padEnd(9)} ${String(r.nsfw ?? '–').padEnd(6)} ${String(r.seconds ? r.seconds.toFixed(0) : '–').padEnd(8)} ${r.error ? `FAILED ${r.error}` : r.file}`);
}
console.log(`\nTotal $${total.toFixed(4)}. Open ${path.join(outDir, 'index.html')} to compare faces.`);
if (rows.some((r) => r.error)) process.exitCode = 1;
