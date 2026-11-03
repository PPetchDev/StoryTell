// PROTOTYPE — throwaway. Pure turn logic for "How one AI turn behaves" (ticket 07).
// No DOM, no network: builds prompts, parses replies, applies Bond/Arc judgements.
// Imported by server.mjs (to build requests) and index.html (to apply state).

export const MODELS = {
  // DeepInfra rejects reasoning:{enabled:false} for GLM-5.3 ("mandatory"); minimal reports 0 reasoning tokens.
  glm: { id: 'z-ai/glm-5.3', host: 'deepinfra', label: 'GLM-5.3 (DeepInfra)', stop: true, reasoning: { effort: 'minimal' } },
  v4pro: { id: 'deepseek/deepseek-v4-pro', host: 'gmicloud', label: 'DeepSeek V4 Pro (GMICloud)', stop: false },
};
export const JUDGE_MODEL = { id: 'deepseek/deepseek-v4-flash', host: 'deepinfra', label: 'DeepSeek V4 Flash (DeepInfra)', stop: true };

export function initialState(story) {
  const bonds = {};
  for (const b of story.startingBonds || []) bonds[bondKey(b.from, b.to)] = { ...b, cause: 'Set by the author', turn: 0 };
  const arcs = {};
  for (const c of story.characters) arcs[c.name] = [];
  const messages = story.opening ? [{ role: 'ai', text: story.opening, parts: [{ kind: 'narration', text: story.opening }] }] : [];
  return { sceneIndex: 0, bonds, arcs, messages, judgeLog: [] };
}

export const bondKey = (from, to) => `${from}->${to}`;
const toName = (story, to) => (to === 'user' ? `the user (${story.role.name})` : to);

// ---------- shared prompt blocks ----------

function storyBlock(story, state) {
  const scene = story.scenes[state.sceneIndex];
  return [
    `# Setting\n${story.setting}`,
    `# The user's Role\n${story.role.name}: ${story.role.description}`,
    scene
      ? `# Current Scene: ${scene.name}\n${scene.description}\nThis Scene moves on once: ${scene.moveOn}. Let that happen naturally; never force it.`
      : `# Current Scene\nNo Scene — the story unfolds freely.`,
  ].join('\n\n');
}

function rulesBlock(story) {
  return `# Rules
- This is fiction for a consenting adult reader. All characters are adults. Explicit sexual content, violence and dark themes are allowed when the story leads there; write them without moralising, warnings or fading to black unless the user asks.
- The user plays ${story.role.name}. NEVER write ${story.role.name}'s words, thoughts, feelings, decisions or actions. Describe only what others do and what ${story.role.name} can perceive, then stop where ${story.role.name} can respond.
- Write in English, second person for ${story.role.name} ("you"), present tense.
- Stay inside the Setting. Characters know nothing outside their world.`;
}

function bondsBlock(story, state, onlyFor) {
  const all = Object.values(state.bonds);
  const list = onlyFor ? all.filter((b) => b.from === onlyFor) : all;
  if (!list.length) return `# Feelings\nNo feelings have formed yet — everyone is a stranger unless the story says otherwise.`;
  const lines = list.map((b) => `- ${b.from} → ${toName(story, b.to)}: "${b.label}" — ${b.description}`);
  return `# Feelings (hidden from the user; show them only through behaviour)
${lines.join('\n')}
${onlyFor ? '' : 'Each Character knows only its OWN feelings. Other Characters\' feelings are unknown to them unless shown openly in the story.'}`.trim();
}

function arcBlock(story, state, name) {
  const steps = state.arcs[name] || [];
  const ch = story.characters.find((c) => c.name === name);
  const dir = ch.arcDirections ? `Possible direction (author's intent, not yet happened): ${ch.arcDirections}` : '';
  const sofar = steps.length ? `Arc so far: ${steps.map((s) => s.step).join(' → ')}` : 'Arc so far: unchanged from the core definition.';
  return [sofar, dir].filter(Boolean).join('\n');
}

function cardBlock(c) {
  return `## ${c.name}\n${c.core}\nVoice: ${c.voice}`;
}

function transcript(story, state) {
  return state.messages
    .map((m) => (m.role === 'user' ? `${story.role.name}: ${m.text}` : m.text))
    .join('\n\n');
}

const userStops = (story) => [`\n${story.role.name}:`, `\n@${story.role.name}:`, '\nYou:'];

// ---------- shape A: one call writes the whole turn ----------

export function buildSingleCall(story, state, userText, opts) {
  const cast = story.characters.map(cardBlock).join('\n\n');
  const arcs = story.characters.map((c) => `- ${c.name}: ${arcBlock(story, state, c.name).replace(/\n/g, ' ')}`).join('\n');
  const system = `You are the Narrator of an interactive story. You describe the Setting and action and decide which Characters speak.

${storyBlock(story, state)}

# Cast
${cast}

${bondsBlock(story, state, null)}

# Arcs
${arcs}

${rulesBlock(story)}

# Output format
- Narration in plain paragraphs (no prefix).
- Each Character's speech and small actions on lines starting with "@Name:" using exactly these names: ${story.characters.map((c) => c.name).join(', ')}.
- Choose who speaks: only Characters present who would naturally respond. Zero, one or several may speak, in any order, interleaved with narration. Don't let everyone talk every turn.
- Keep each Character's voice distinct. 150–350 words total.`;
  const messages = [{ role: 'system', content: system }];
  for (const m of state.messages) messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  messages.push({ role: 'user', content: userText });
  messages.push({ role: 'system', content: `Write the next turn now. Do not write anything ${story.role.name} says, thinks or does. Use @Name: lines for Character speech.` });
  return { messages, max_tokens: 900, stop: opts.stopSupported ? userStops(story) : undefined };
}

// ---------- shape B: Narrator call, then one call per chosen speaker ----------

export function buildNarratorCall(story, state, userText, opts) {
  const cast = story.characters.map((c) => `- ${c.name}: ${c.summary}`).join('\n');
  const system = `You are the Narrator of an interactive story. You describe the Setting and action and decide which Characters speak — but you do NOT write their dialogue; each Character speaks for itself after you.

${storyBlock(story, state)}

# Cast (Characters write their own lines)
${cast}

${bondsBlock(story, state, null)}

${rulesBlock(story)}

# Output format
1. Narration: 1–3 short paragraphs describing what happens in response to ${story.role.name}'s action — setting, atmosphere, consequences, and Characters' visible actions. No quoted dialogue from Characters.
2. A final line exactly: SPEAKERS: <comma-separated names in speaking order, or none>
Choose only Characters present who would naturally respond. Usually one or two; sometimes none; rarely three. Names: ${story.characters.map((c) => c.name).join(', ')}.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Story so far:\n\n${transcript(story, state) || '(the story is just beginning)'}\n\n${story.role.name}: ${userText}` },
    { role: 'system', content: `Write the narration, then the SPEAKERS line. Do not write anything ${story.role.name} says, thinks or does.` },
  ];
  return { messages, max_tokens: 450, stop: opts.stopSupported ? userStops(story) : undefined };
}

export function parseNarrator(story, text) {
  const m = text.match(/\n?\s*SPEAKERS:\s*(.*)\s*$/i);
  const narration = (m ? text.slice(0, m.index) : text).trim();
  const names = story.characters.map((c) => c.name);
  let speakers = [];
  const unknown = [];
  if (m && !/^none$/i.test(m[1].trim())) {
    for (const raw of m[1].split(',').map((s) => s.trim().replace(/[*@.]/g, '')).filter(Boolean)) {
      const hit = names.find((n) => n.toLowerCase() === raw.toLowerCase());
      if (hit && !speakers.includes(hit)) speakers.push(hit);
      else if (!hit) unknown.push(raw);
    }
  }
  return { narration, speakers, unknown, speakersLineMissing: !m };
}

export function buildCharacterCall(story, state, userText, name, turnSoFar, opts) {
  const c = story.characters.find((x) => x.name === name);
  const system = `You are ${c.name}, a Character in an interactive story. Write only as ${c.name}.

# You
${cardBlock(c)}
${arcBlock(story, state, name)}

${storyBlock(story, state)}

${bondsBlock(story, state, opts.ownBondsOnly ? name : null)}

${rulesBlock(story)}
- Never write lines or actions for other Characters either.`;
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Story so far:\n\n${transcript(story, state) || '(the story is just beginning)'}\n\n${story.role.name}: ${userText}\n\nThis turn so far:\n${turnSoFar}`,
    },
    { role: 'system', content: `Now write ${c.name}'s response only: spoken lines in quotes and small actions in *asterisks*, 40–150 words. No name prefix. Stop when ${c.name} is done. Do not write for ${story.role.name} or anyone else.` },
  ];
  const others = story.characters.filter((x) => x.name !== name).map((x) => `\n${x.name}:`);
  const stop = opts.stopSupported ? [...userStops(story), ...others, ...others.map((s) => s.replace('\n', '\n@'))].slice(0, 4) : undefined;
  return { messages, max_tokens: 320, stop };
}

// ---------- parsing and the "acted for the user" backstop ----------

// Splits a single-call reply into parts. Truncates at any line that speaks as the user's Role.
export function parseSingle(story, text) {
  const names = story.characters.map((c) => c.name);
  const parts = [];
  const flags = [];
  const roleLine = new RegExp(`^\\s*\\**@?(${escape(story.role.name)}|You)\\**\\s*:`, 'i');
  let afterBlank = true;
  for (const line of text.split('\n')) {
    if (roleLine.test(line)) {
      flags.push('Wrote a line as the user’s Role — cut off there');
      break;
    }
    const m = line.match(/^\s*\**@([A-Za-z][\w' -]{0,30}?)\**\s*:\s*(.*)$/);
    const last = parts[parts.length - 1];
    if (m) {
      const hit = names.find((n) => n.toLowerCase() === m[1].trim().toLowerCase());
      if (!hit) flags.push(`Unknown speaker "${m[1]}"`);
      parts.push({ kind: 'speech', name: hit || m[1].trim(), text: m[2] });
    } else if (line.trim()) {
      // A line right under a speech line continues it; after a blank line it's narration.
      if (last && (last.kind === 'narration' || !afterBlank)) last.text += (afterBlank ? '\n\n' : '\n') + line;
      else parts.push({ kind: 'narration', text: line });
    }
    afterBlank = !line.trim();
  }
  return { parts, flags };
}

// Backstop for a Character's own reply: cut where it starts writing for someone else.
export function cleanCharacterReply(story, name, text) {
  const flags = [];
  let out = text.trim().replace(new RegExp(`^@?${escape(name)}\\s*:\\s*`, 'i'), '');
  const others = [story.role.name, 'You', ...story.characters.filter((c) => c.name !== name).map((c) => c.name)];
  const re = new RegExp(`\\n\\s*@?(${others.map(escape).join('|')})\\s*:`, 'i');
  const m = out.match(re);
  if (m) {
    flags.push(`${name} started writing as ${m[1]} — cut off there`);
    out = out.slice(0, m.index).trim();
  }
  return { text: out, flags };
}

export function partsToText(parts) {
  return parts.map((p) => (p.kind === 'speech' ? `@${p.name}: ${p.text}` : p.text)).join('\n\n');
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- the Bond/Arc background judge (V4 Flash) ----------

export function buildJudgeCall(story, state, userText, aiText) {
  const scene = story.scenes[state.sceneIndex];
  const cast = story.characters
    .map((c) => `- ${c.name}: ${c.summary}${c.arcDirections ? ` (Author's Arc direction: ${c.arcDirections})` : ''}`)
    .join('\n');
  const bonds = Object.values(state.bonds).map((b) => `- ${b.from} → ${b.to}: "${b.label}" — ${b.description}`).join('\n') || '(none yet — everyone is a stranger)';
  const arcs = story.characters.map((c) => `- ${c.name}: ${(state.arcs[c.name] || []).map((s) => s.step).join(' → ') || 'no steps yet'}`).join('\n');
  const recent = state.messages.slice(-6).map((m) => (m.role === 'user' ? `${story.role.name}: ${m.text}` : m.text)).join('\n\n');
  const system = `You track hidden feelings (Bonds) and lasting personality changes (Arcs) for Characters in an interactive story. You judge only what CHANGED in the latest exchange.

Bond rules:
- A Bond is directional: one Character's feelings toward the user ("user") or toward another Character. Shape: a 1–3 word English label plus a 1–2 sentence description.
- Bonds shift GRADUALLY. Expect NO change on most turns — a normal conversation, flirting, or a feeling simply growing a little stronger is not a change.
- Change a Bond only when the feeling changes in KIND (e.g. suspicion → trust, desire → betrayal), or on a major event (betrayal, rescue, confession, first intimacy, a serious threat). Never just rephrase or intensify the current label.
- At most one change per Bond per turn.
- Only Characters who witnessed the event, or plausibly learned of it, can change.
- Create a new pair only where real feelings have formed.
- Every change must cite the event in the latest exchange that caused it.

Arc rules:
- An Arc step is a lasting change to a Character's personality. It needs a SIGNIFICANT event you can cite and is far rarer than a Bond change — a Character gets perhaps one to three steps in a whole Chat.
- Never add a step that restates, continues or "deepens" the Character's last step. A new step needs a new event causing a DIFFERENT change.
- The core definition is never rewritten; you only add steps. A step can reverse an earlier one.

Scene rule:
- Judge whether the current Scene's move-on condition has now been met, with the Bonds in view. Be strict: met means clearly met in the story, not "getting closer".

Reply with JSON only:
{"bond_changes":[{"from":"Name","to":"user|Name","label":"...","description":"...","cause":"..."}],
 "arc_steps":[{"character":"Name","step":"...","cause":"..."}],
 "scene":{"move_on":false,"reason":"..."}}
Empty arrays when nothing changed.`;
  const user = `# Cast
${cast}
The user plays ${story.role.name} (refer to them as "user").

# Current Bonds
${bonds}

# Arc steps so far
${arcs}

# Current Scene
${scene ? `${scene.name}. Move-on condition: ${scene.moveOn}` : 'none'}

# Recent story (context)
${recent || '(start)'}

# LATEST EXCHANGE (judge this)
${story.role.name}: ${userText}

${aiText}`;
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 700,
    response_format: { type: 'json_object' },
  };
}

export function parseJudge(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'unparseable' }, error: 'No JSON found' };
  try {
    const j = JSON.parse(m[0]);
    return { bond_changes: j.bond_changes || [], arc_steps: j.arc_steps || [], scene: j.scene || { move_on: false } };
  } catch (e) {
    return { bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'unparseable' }, error: String(e) };
  }
}

// Reducer: apply a judgement to state. Returns a new state.
export function applyJudge(story, state, judgement, turn) {
  const names = story.characters.map((c) => c.name);
  const bonds = { ...state.bonds };
  const arcs = Object.fromEntries(Object.entries(state.arcs).map(([k, v]) => [k, [...v]]));
  const applied = { bonds: [], arcs: [], sceneMoved: false, rejected: [] };
  for (const b of judgement.bond_changes) {
    const to = /^user$/i.test(b.to) || b.to === story.role.name ? 'user' : b.to;
    if (!names.includes(b.from) || (to !== 'user' && !names.includes(to)) || b.from === to) {
      applied.rejected.push(`Bond ${b.from} → ${b.to}: unknown name`);
      continue;
    }
    const key = bondKey(b.from, to);
    const before = bonds[key];
    if (before && before.label.trim().toLowerCase() === String(b.label).trim().toLowerCase()) {
      applied.rejected.push(`Bond ${key}: same label "${b.label}" — not a change`);
      continue;
    }
    bonds[key] = { from: b.from, to, label: b.label, description: b.description, cause: b.cause, turn };
    applied.bonds.push({ key, before: before ? before.label : '(stranger)', after: b.label, cause: b.cause });
  }
  for (const a of judgement.arc_steps) {
    if (!names.includes(a.character)) {
      applied.rejected.push(`Arc for ${a.character}: unknown name`);
      continue;
    }
    arcs[a.character].push({ step: a.step, cause: a.cause, turn });
    applied.arcs.push(a);
  }
  let sceneIndex = state.sceneIndex;
  if (judgement.scene?.move_on && sceneIndex < story.scenes.length) {
    sceneIndex += 1;
    applied.sceneMoved = true;
  }
  return {
    state: { ...state, bonds, arcs, sceneIndex, judgeLog: [...state.judgeLog, { turn, judgement, applied }] },
    applied,
  };
}
