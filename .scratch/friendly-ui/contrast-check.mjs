// WCAG 2.x contrast for every text/icon colour pair in apps/web.
// Usage: node .scratch/friendly-ui/contrast-check.mjs [before|after] [--fail]
// A colour is a token ('--muted'), a hex ('#bbb') or 'rgba(r,g,b,a)'. A background is a list of
// layers, bottom first; translucent layers are composited over what's under them. `op` is the
// element's own opacity (a disabled state), which fades both its fill and its text into `under`.

const BEFORE = {
    '--bg': '#16131f', '--surface': '#221d30', '--surface-raised': '#2c2540', '--text': '#ece8f6',
    '--muted': '#a59cbd', '--accent': '#8f73ff', '--accent-text': '#ffffff', '--line': '#3a3150',
    '--accent-soft': 'rgba(143,115,255,0.18)', '--danger': '#ff7a8a', '--danger-soft': '#5a1f2b',
    '--danger-text': '#ffd5db', '--warning': '#ffc46b', '--warning-surface': '#3a2a12',
    '--warning-soft': 'rgba(255,180,84,0.14)',
};
const AFTER = {
    ...BEFORE,
    '--muted': '#b4abcb',
    '--faint': '#8e85a8',
    '--accent-fill': '#7357ec',
};
BEFORE['--faint'] = BEFORE['--muted']; // not a token yet: pairs that use it only exist after
const which = process.argv[2] ?? 'before';
const T = which === 'after' ? AFTER : BEFORE;

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
    const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
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

// [where, fg, bg layers, min, {op, after:{fg,bg}}]
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
pair('Primary button text on accent (.button, send, Play, segmented)', '--accent-text', ['--accent'], 4.5, { after: { bg: ['--accent-fill'] } });
pair('Warning text on page', '--warning', BG);
pair('Warning text on surface', '--warning', SF);
pair('Warning text on warning box', '--warning', ['--warning-surface']);
pair('Danger text on surface (Reset Chat row)', '--danger', SF);
pair('Danger link on the page (Delete Story)', '--danger', BG);
pair('Danger button text on danger fill', '--danger-text', ['--danger-soft']);
pair('Legacy .button-danger: white on #8a2d3b', '#ffffff', ['#8a2d3b'], 4.5, { after: { fg: '--danger-text', bg: ['--danger-soft'] } });
pair('User bubble text on accent tint', '--text', ['--bg', '--accent-soft']);
pair('Accent on accent tint (⚡ pressed)', '--accent', ['--bg', '--accent-soft'], 3);
pair('Selected tab text on accent tint', '--text', ['--bg', '--accent-soft']);
pair('Assistant change link on accent tint over surface', '--text', ['--surface', '--accent-soft']);
pair('Assistant change link icon on accent tint', '--muted', ['--surface', '--accent-soft'], 3);
pair('Needed mark on warning tint over surface', '--warning', ['--surface', '--warning-soft']);
pair('Text on warning box (status box, assistant removals)', '--text', ['--warning-surface']);
pair('Status box list item on dark tint over warning box', '--text', ['--warning-surface', 'rgba(0,0,0,0.2)']);
pair('Status box toggle #ffe2b8 on warning box', '#ffe2b8', ['--warning-surface']);
pair('Status box OK #bfeccc on #15301f', '#bfeccc', ['#15301f']);
// Global stylesheet literals
pair('Quiet button text on #3a3150', '--text', ['#3a3150']);
pair('Pill / chip muted on #3a3150', '--muted', ['#3a3150']);
pair('Pill OK #9be7c4 on #1f4d3a', '#9be7c4', ['#1f4d3a']);
pair('Banner text on #4a2a12', '--text', ['#4a2a12']);
pair('Warning-text #f3b26b on #4a2a12', '#f3b26b', ['#4a2a12']);
pair('Turn/field error #f3b26b on page', '#f3b26b', BG);
pair('Turn error #f3b26b on surface (dashboard)', '#f3b26b', SF);
pair('Notice text on #2d2742', '--text', ['#2d2742']);
pair('Rollback notice text on #23313a', '--text', ['#23313a']);
pair('Toast text on #2b3a2e', '--text', ['#2b3a2e']);
pair('Toast detail muted on #2b3a2e', '--muted', ['#2b3a2e']);
pair('Event #d9c48a on page', '#d9c48a', BG);
pair('Event #d9c48a on surface', '#d9c48a', SF);
pair('Confirm warning #f0c9a0 on surface', '#f0c9a0', SF);
pair('Gallery earlier #e0b36a on page', '#e0b36a', BG);
pair('Snapshot failed text on #3a2b2e', '--text', ['#3a2b2e']);
// Snapshot viewer (black stage)
pair('Viewer text #fff on black', '#ffffff', ['#000000']);
pair('Viewer count/meta #bbb on black', '#bbbbbb', ['#000000']);
pair('Viewer link #c9b9ff on black', '#c9b9ff', ['#000000']);
pair('Viewer prompt #ddd on #1a1a1a', '#dddddd', ['#1a1a1a']);
// Story grid: badge over the darkest and the lightest cover
pair('Cover badge warning on 65% black over white cover', '--warning', ['#ffffff', 'rgba(0,0,0,0.65)'], 4.5, { after: { bg: ['#ffffff', 'rgba(0,0,0,0.78)'] } });
pair('Danger text on raised surface (Reset row pressed)', '--danger', SR);
pair('Warning text on raised surface', '--warning', SR);
// Field rewrite ✨
pair('Rewrite ✨ #c7b6ff on surface', '#c7b6ff', SF);
pair('Links in a notice: accent on #2d2742', '--accent', ['#2d2742'], 4.5, { after: { fg: '--text' } });
pair('Links in the rollback notice: accent on #23313a', '--accent', ['#23313a'], 4.5, { after: { fg: '--text' } });
pair('Snapshot placeholder text at its faintest pulse (opacity .55)', '--muted', SF, 4.5, { op: 0.55, under: BG, after: { op: 0.75 } });
// Icons and non-text (3:1)
pair('Writing dots at rest under reduced motion (opacity .6)', '--accent', BG, 3, { op: 0.6, under: BG, after: { op: 0.75 } });
pair('Disabled ⚡ icon (--line) on page', '--line', BG, 3, { after: { fg: '--faint' } });
pair('Writing dots accent on page (icon)', '--accent', BG, 3);
pair('Needs-attention dot warning on page (icon)', '--warning', BG, 3);
pair('Bottom nav current icon accent on page', '--accent', BG, 3);
// Disabled states (opacity fades the element into what's under it)
pair('Disabled primary button (opacity .6) on page', '--accent-text', ['--accent'], 4.5, { op: 0.6, under: BG, after: { op: 1, fg: '--muted', bg: ['--surface-raised'] } });
pair('Disabled quiet button (opacity .6) on surface', '--text', ['#3a3150'], 4.5, { op: 0.6, under: SF, after: { op: 1, fg: '--muted', bg: ['--surface-raised'] } });
pair('Disabled menu item (opacity .5) on surface', '--text', SF, 4.5, { op: 0.5, under: SF, after: { op: 1, fg: '--faint' } });
pair('Disabled menu item sub-line (opacity .5) on surface', '--muted', SF, 4.5, { op: 0.5, under: SF, after: { op: 1, fg: '--faint' } });
pair('Disabled Add button muted (opacity .5) on surface', '--muted', SF, 4.5, { op: 0.5, under: SF, after: { op: 1, fg: '--faint' } });
pair('Disabled Add button on page', '--muted', BG, 4.5, { op: 0.5, under: BG, after: { op: 1, fg: '--faint' } });
pair('Story sheet primary disabled (opacity .6)', '--accent-text', ['--accent'], 4.5, { op: 0.6, under: SF, after: { op: 1, fg: '--muted', bg: ['--surface-raised'] } });
pair('Disabled Play (opacity .45) on page', '--accent-text', ['--accent'], 4.5, { op: 0.45, under: BG, after: { op: 1, fg: '--muted', bg: ['--surface-raised'] } });
pair('Read-only field (opacity .6) on page', '--text', BG, 4.5, { op: 0.6, under: SF });
pair('Story sheet secondary disabled (opacity .6)', '--text', SF, 4.5, { op: 0.6, under: SF, after: { op: 1, fg: '--muted' } });
// Character colours, on the page and the surface (spec: Character colour)
const CHAR = ['#f2b766', '#5fd0c5', '#f08aa8', '#8fc7ff', '#b5e07a', '#d6a8ff', '#ffa07a', '#7fe0a0', '#c4bdd6'];
for (const c of CHAR) {
    pair(`Character colour ${c} on page`, c, BG);
    pair(`Character colour ${c} on surface`, c, SF);
}

const fail = process.argv.includes('--fail');
let failures = 0;
const rows = [];
for (const p of P) {
    const a = which === 'after' ? { ...p, ...(p.after ?? {}) } : p;
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
    rows.push({ where: p.where, fg: hex(text), bg: hex(fill), ratio: r.toFixed(2), min: a.min, ok: ok ? 'ok' : 'FAIL' });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
else for (const r of rows) if (!fail || r.ok === 'FAIL') console.log(`${r.ok.padEnd(4)} ${r.ratio.padStart(5)} (min ${r.min})  ${r.fg} on ${r.bg}  ${r.where}`);
console.log(`${which}: ${rows.length} pairs, ${failures} below threshold`);
