// WCAG 2.x contrast for every text/icon colour pair in apps/web, in the dark or the light theme.
// Usage: node apps/web/scripts/contrast-check.mjs dark|light [--fail] [--json]
//
// Moved here from .scratch/friendly-ui/contrast-check.mjs (Chat looks ticket 01), which is kept as a
// historical record. The token table below must match app/globals.css: `:root` holds the dark
// values, and `:root[data-theme='light']` overrides them. The script checks that before anything
// else, so the table can't drift from the stylesheet.
//
// A colour is a token ('--muted'), a hex ('#bbb') or 'rgba(r,g,b,a)'. A background is a list of
// layers, bottom first; translucent layers are composited over what's under them. `op` is the
// element's own opacity (a disabled state), which fades both its fill and its text into `under`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DARK = {
    '--bg': '#16131f',
    '--surface': '#221d30',
    '--text': '#ece8f6',
    '--muted': '#b4abcb',
    '--faint': '#8e85a8',
    '--accent': '#8f73ff',
    '--accent-text': '#ffffff',
    '--accent-fill': '#7357ec',
    '--surface-raised': '#2c2540',
    '--line': '#3a3150',
    '--accent-soft': 'rgba(143, 115, 255, 0.18)',
    '--accent-line': 'rgba(143, 115, 255, 0.35)',
    '--danger': '#ff7a8a',
    '--danger-soft': '#5a1f2b',
    '--danger-text': '#ffd5db',
    '--warning': '#ffc46b',
    '--warning-surface': '#3a2a12',
    '--warning-line': '#8a6326',
    '--warning-soft': 'rgba(255, 180, 84, 0.14)',
    '--quiet-fill': '#3a3150',
    '--ok-surface': '#1f4d3a',
    '--ok-text': '#9be7c4',
    '--banner-surface': '#4a2a12',
    '--banner-line': '#b8742a',
    '--caution-text': '#f3b26b',
    '--error-text': '#f3b26b',
    '--notice-surface': '#2d2742',
    '--notice-line': '#4a4068',
    '--rollback-surface': '#23313a',
    '--rollback-line': '#3d5a68',
    '--toast-surface': '#2b3a2e',
    '--toast-line': '#4a7a52',
    '--event': '#d9c48a',
    '--confirm-warning-text': '#f0c9a0',
    '--earlier-text': '#e0b36a',
    '--rewrite-text': '#c7b6ff',
    '--snapshot-failed-surface': '#3a2b2e',
    '--snapshot-failed-line': '#7a4a52',
    '--status-ok-surface': '#15301f',
    '--status-ok-line': '#2f6b45',
    '--status-ok-text': '#bfeccc',
    '--status-toggle-text': '#ffe2b8',
    '--status-item-tint': 'rgba(0, 0, 0, 0.2)',
    '--picture-chip': 'rgba(22, 19, 31, 0.78)',
    '--on-picture-text': '#ece8f6',
    '--on-picture-warning': '#ffc46b',
    '--scrim': 'rgba(5, 3, 12, 0.6)',
    '--shadow-soft': 'rgb(0 0 0 / 0.18)',
    '--shadow': 'rgba(0, 0, 0, 0.4)',
    '--shadow-strong': 'rgba(0, 0, 0, 0.55)',
    '--character-1': '#f2b766',
    '--character-2': '#5fd0c5',
    '--character-3': '#f08aa8',
    '--character-4': '#8fc7ff',
    '--character-5': '#b5e07a',
    '--character-6': '#d6a8ff',
    '--character-7': '#ffa07a',
    '--character-8': '#7fe0a0',
    '--character-neutral': '#c4bdd6',
    '--on-character': '#16131f',
    '--backdrop-dim': 'rgba(22, 19, 31, 0.94)',
};
// What `:root[data-theme='light']` overrides; every other token keeps its dark value.
const LIGHT_OVERRIDES = {
    '--bg': '#f6f4fa',
    '--surface': '#ffffff',
    '--text': '#15111e',
    '--muted': '#4a4360',
    '--faint': '#6c6486',
    '--accent': '#5b3fd9',
    '--accent-text': '#ffffff',
    '--accent-fill': '#6a4ff0',
    '--surface-raised': '#ece8f4',
    '--line': '#d9d2e6',
    '--accent-soft': 'rgba(106, 79, 240, 0.12)',
    '--accent-line': 'rgba(106, 79, 240, 0.4)',
    '--danger': '#b3243a',
    '--danger-soft': '#fbe1e5',
    '--danger-text': '#8a1428',
    '--warning': '#8a5a00',
    '--warning-surface': '#fdf1db',
    '--warning-line': '#d9a548',
    '--warning-soft': 'rgba(217, 150, 40, 0.14)',
    '--quiet-fill': '#e6e1f0',
    '--ok-surface': '#dcf2e5',
    '--ok-text': '#1b5e3b',
    '--banner-surface': '#fdeedb',
    '--banner-line': '#d9a05c',
    '--caution-text': '#8a4b00',
    '--error-text': '#a33a0c',
    '--notice-surface': '#ebe7f7',
    '--notice-line': '#cbc2e8',
    '--rollback-surface': '#e2eef3',
    '--rollback-line': '#a7c5d2',
    '--toast-surface': '#e3f2e5',
    '--toast-line': '#9ac8a2',
    '--event': '#735400',
    '--confirm-warning-text': '#8a4510',
    '--earlier-text': '#8a5a00',
    '--rewrite-text': '#5b3fd9',
    '--snapshot-failed-surface': '#fbe7ea',
    '--snapshot-failed-line': '#dfa4ae',
    '--status-ok-surface': '#e1f4e7',
    '--status-ok-line': '#9dd0ae',
    '--status-ok-text': '#1b5631',
    '--status-toggle-text': '#6b4500',
    '--status-item-tint': 'rgba(0, 0, 0, 0.05)',
    '--picture-chip': 'rgba(255, 255, 255, 0.88)',
    '--scrim': 'rgba(20, 14, 40, 0.4)',
    '--shadow-soft': 'rgb(30 20 60 / 0.12)',
    '--shadow': 'rgba(30, 20, 60, 0.18)',
    '--shadow-strong': 'rgba(30, 20, 60, 0.25)',
    // Darker versions of the dark set's hues, for a light page.
    '--character-1': '#7a5000',
    '--character-2': '#0b645e',
    '--character-3': '#b02c58',
    '--character-4': '#1f5fa6',
    '--character-5': '#41610e',
    '--character-6': '#7a3dc2',
    '--character-7': '#9c3a14',
    '--character-8': '#126a38',
    '--character-neutral': '#5c5670',
    '--on-character': '#ffffff',
    '--backdrop-dim': 'rgba(246, 244, 250, 0.9)',
};
const THEMES = { dark: DARK, light: { ...DARK, ...LIGHT_OVERRIDES } };

const which = process.argv[2] ?? 'dark';
if (!(which in THEMES)) {
    console.error(`Usage: node contrast-check.mjs dark|light [--fail] [--json]`);
    process.exit(2);
}
const T = THEMES[which];

// --- The table must match the stylesheet ---------------------------------------------------------
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'globals.css'), 'utf8');
function block(selector) {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) return null;
    const end = css.indexOf('\n}', start);
    const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
    const tokens = {};
    for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
    return tokens;
}
const norm = (v) => v.replace(/\s+/g, ' ').toLowerCase();
const rootTokens = block(':root');
const lightTokens = { ...rootTokens, ...(block(":root[data-theme='light']") ?? {}) };
const sheet = which === 'light' ? lightTokens : rootTokens;
let drift = 0;
for (const [name, value] of Object.entries(T)) {
    if (!(name in sheet)) {
        console.log(`DRIFT ${name}: in the table, not in globals.css`);
        drift++;
    } else if (norm(sheet[name]) !== norm(value)) {
        console.log(`DRIFT ${name}: table ${value}, globals.css ${sheet[name]} (${which})`);
        drift++;
    }
}
const COLOURLESS = new Set(['--sheet-half', '--rail-width']);
for (const name of Object.keys(sheet)) {
    if (!(name in T) && !COLOURLESS.has(name) && /#|rgb|hsl/.test(sheet[name])) {
        console.log(`DRIFT ${name}: in globals.css, not in the table`);
        drift++;
    }
}

// --- Colour maths --------------------------------------------------------------------------------
function parse(c) {
    if (c.startsWith('--')) {
        if (!(c in T)) throw new Error(`unknown token ${c}`);
        return parse(T[c]);
    }
    if (c.startsWith('#')) {
        let h = c.slice(1);
        if (h.length === 3) h = [...h].map((x) => x + x).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    return [+r, +g, +b, +a];
}
const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
function flatten(layers) {
    let acc = parse(layers[0]);
    if (acc[3] !== 1) throw new Error(`bottom layer must be opaque: ${layers[0]}`);
    for (const l of layers.slice(1)) acc = over(parse(l), acc);
    return acc;
}
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a, b) {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// --- The pairs: [where, fg, bg layers, min, {op, under}] -------------------------------------------
const BG = ['--bg'];
const SF = ['--surface'];
const SR = ['--surface-raised'];
const P = [];
const pair = (where, fg, bg, min = 4.5, extra = {}) => P.push({ where, fg, bg, min, ...extra });

// Global tokens
pair('Body text on page', '--text', BG);
pair('Body text on surface', '--text', SF);
pair('Body text on raised surface', '--text', SR);
pair('Muted text on page', '--muted', BG);
pair('Muted text on surface', '--muted', SF);
pair('Muted text on raised surface (disabled send, reason)', '--muted', SR);
pair('Accent text/links on page', '--accent', BG);
pair('Accent text/links on surface', '--accent', SF);
pair('Primary button text on accent fill (.button, send, Play, segmented)', '--accent-text', ['--accent-fill']);
pair('Warning text on page', '--warning', BG);
pair('Warning text on surface', '--warning', SF);
pair('Warning text on warning box', '--warning', ['--warning-surface']);
pair('Danger text on surface (Reset Chat row)', '--danger', SF);
pair('Danger link on the page (Delete Story)', '--danger', BG);
pair('Danger button text on danger fill', '--danger-text', ['--danger-soft']);
pair('Legacy .button-danger: danger text on danger fill', '--danger-text', ['--danger-soft']);
pair('User bubble text on accent tint', '--text', ['--bg', '--accent-soft']);
pair('Accent on accent tint (⚡ pressed)', '--accent', ['--bg', '--accent-soft'], 3);
pair('Selected tab text on accent tint', '--text', ['--bg', '--accent-soft']);
pair('Assistant change link on accent tint over surface', '--text', ['--surface', '--accent-soft']);
pair('Assistant change link icon on accent tint', '--muted', ['--surface', '--accent-soft'], 3);
pair('Needed mark on warning tint over surface', '--warning', ['--surface', '--warning-soft']);
pair('Text on warning box (status box, assistant removals)', '--text', ['--warning-surface']);
pair('Status box list item on its tint over warning box', '--text', ['--warning-surface', '--status-item-tint']);
pair('Status box toggle on warning box', '--status-toggle-text', ['--warning-surface']);
pair('Status box OK text on its surface', '--status-ok-text', ['--status-ok-surface']);
// Role tokens (once literals in the stylesheets)
pair('Quiet button text on quiet fill', '--text', ['--quiet-fill']);
pair('Pill / chip muted on quiet fill', '--muted', ['--quiet-fill']);
pair('Pill OK text on OK surface', '--ok-text', ['--ok-surface']);
pair('Banner text on banner surface', '--text', ['--banner-surface']);
pair('Caution text on banner surface', '--caution-text', ['--banner-surface']);
pair('Turn/field error on page', '--error-text', BG);
pair('Turn error on surface (dashboard)', '--error-text', SF);
pair('Notice text on notice surface', '--text', ['--notice-surface']);
pair('Rollback notice text on its surface', '--text', ['--rollback-surface']);
pair('Toast text on toast surface', '--text', ['--toast-surface']);
pair('Toast detail muted on toast surface', '--muted', ['--toast-surface']);
pair('Event on page', '--event', BG);
pair('Event on surface', '--event', SF);
pair('Confirm warning on surface', '--confirm-warning-text', SF);
pair('Gallery earlier on page', '--earlier-text', BG);
pair('Snapshot failed text on its surface', '--text', ['--snapshot-failed-surface']);
pair('Links in a notice: text on notice surface', '--text', ['--notice-surface']);
pair('Links in the rollback notice: text on its surface', '--text', ['--rollback-surface']);
pair('Rewrite ✨ on surface', '--rewrite-text', SF);
pair('Cover banner chip text over a white picture', '--text', ['#ffffff', '--picture-chip']);
pair('Cover banner chip text over a black picture', '--text', ['#000000', '--picture-chip']);
// Snapshot viewer (black stage, literal in both themes)
pair('Viewer text #fff on black', '#ffffff', ['#000000']);
pair('Viewer count/meta #bbb on black', '#bbbbbb', ['#000000']);
pair('Viewer link #c9b9ff on black', '#c9b9ff', ['#000000']);
pair('Viewer prompt #ddd on #1a1a1a', '#dddddd', ['#1a1a1a']);
// Over pictures: a literal scrim, so the text on it keeps one colour in both themes
pair('Cover badge on 78% black over a white cover', '--on-picture-warning', ['#ffffff', 'rgba(0,0,0,0.78)']);
pair('Picker caption on its scrim over a white picture', '--on-picture-text', ['#ffffff', 'rgba(5,3,12,0.85)']);
pair('Danger text on raised surface (Reset row pressed)', '--danger', SR);
pair('Warning text on raised surface', '--warning', SR);
pair('Snapshot placeholder text at its faintest pulse (opacity .75)', '--muted', SF, 4.5, { op: 0.75, under: BG });
// Icons and non-text (3:1)
pair('Writing dots at rest under reduced motion (opacity .75)', '--accent', BG, 3, { op: 0.75, under: BG });
pair('Disabled ⚡ icon (faint) on page', '--faint', BG, 3);
pair('Writing dots accent on page (icon)', '--accent', BG, 3);
pair('Needs-attention dot warning on page (icon)', '--warning', BG, 3);
pair('Bottom nav current icon accent on page', '--accent', BG, 3);
// Disabled states
pair('Disabled primary button on page', '--muted', SR);
pair('Disabled quiet button on surface', '--muted', SR);
pair('Disabled menu item on surface', '--faint', SF);
pair('Disabled menu item sub-line on surface', '--faint', SF);
pair('Disabled Add button on surface', '--faint', SF);
pair('Disabled Add button on page', '--faint', BG);
pair('Read-only field (opacity .6) on page', '--text', BG, 4.5, { op: 0.6, under: SF });
pair('Story sheet secondary disabled on surface', '--muted', SF);
// Character colours, on the page and the surface (spec: Character colour), and an initial on each
const CHARACTER = ['--character-1', '--character-2', '--character-3', '--character-4', '--character-5', '--character-6', '--character-7', '--character-8', '--character-neutral'];
for (const c of CHARACTER) {
    pair(`Character colour ${c} on page`, c, BG);
    pair(`Character colour ${c} on surface`, c, SF);
    pair(`Initial on ${c}`, '--on-character', [c]);
}

// The Backdrop (Chat looks ticket 03): narration, names and timestamps on the dimmed picture, over the
// brightest and the darkest picture there is. The blur is decoration and not counted.
for (const [shade, under] of [['white', '#ffffff'], ['black', '#000000']]) {
    const dimmed = [under, '--backdrop-dim'];
    pair(`Text on the Backdrop over a ${shade} picture`, '--text', dimmed);
    pair(`Muted text on the Backdrop over a ${shade} picture`, '--muted', dimmed);
    pair(`Accent on the Backdrop over a ${shade} picture`, '--accent', dimmed);
    for (const c of CHARACTER) pair(`Character colour ${c} on the Backdrop over a ${shade} picture`, c, dimmed);
}

// --- Run -----------------------------------------------------------------------------------------
const fail = process.argv.includes('--fail');
let failures = 0;
const rows = [];
for (const a of P) {
    const op = a.op ?? 1;
    let fill = flatten(a.bg);
    let text = over(parse(a.fg), fill);
    if (op < 1) {
        const under = flatten(a.under);
        fill = over([...fill.slice(0, 3), op], under);
        text = over([...text.slice(0, 3), op], under);
    }
    const r = ratio(text, fill);
    const ok = r + 1e-9 >= a.min;
    if (!ok) failures++;
    rows.push({ where: a.where, fg: hex(text), bg: hex(fill), ratio: r.toFixed(2), min: a.min, ok: ok ? 'ok' : 'FAIL' });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
else for (const r of rows) if (!fail || r.ok === 'FAIL') console.log(`${r.ok.padEnd(4)} ${r.ratio.padStart(5)} (min ${r.min})  ${r.fg} on ${r.bg}  ${r.where}`);
console.log(`${which}: ${rows.length} pairs, ${failures} below threshold, ${drift} token${drift === 1 ? '' : 's'} out of step with globals.css`);
if (fail && (failures > 0 || drift > 0)) process.exit(1);
