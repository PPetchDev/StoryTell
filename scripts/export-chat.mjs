// Copies live Chats to this PC for the long-input account eval (.scratch/story-so-far-start/spec.md):
//
//   node scripts/export-chat.mjs 1 3 4
//
// For each Chat id it runs one read-only SELECT on the VM's database (over ssh, as the app's own
// database user) and writes what it answers to .data/eval-inputs/chat-<id>.json: the Chat's
// Messages with their parts, the Story's Character names, the Persona's and Role's names, and the
// Chat's own records of Items and Facts with the Message each came at (for picking keepers).
// .data/ is git-ignored. Nothing is written on the VM, and nothing is printed but the counts.
//
// The Chats are the user's private text: run it only with the user's OK.
//
// Settings come from .env.vm (git-ignored), as for vm:deploy: VM_SSH and VM_SSH_KEY.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

/** Psql on the VM, reading SQL from standard input: one unaligned value per line, no header. */
export const PSQL = 'sudo -u storytell psql -d storytell_live -v ON_ERROR_STOP=1 -At';

/** The one statement sent for a Chat: a SELECT that builds its copy as JSON. */
export function exportSql(chatId) {
    if (!Number.isInteger(chatId) || chatId < 1) throw new Error(`"${chatId}" is not a Chat id.`);
    return `BEGIN READ ONLY;
SELECT json_build_object(
    'chatId', c.id,
    'personaName', (SELECT p.name FROM persona p WHERE p.id = c.persona_id),
    'roleName', (SELECT r.name FROM role r WHERE r.story_id = c.story_id ORDER BY r.id LIMIT 1),
    'castNames', (SELECT coalesce(json_agg(ch.name ORDER BY ch.id), '[]'::json) FROM character ch WHERE ch.story_id = c.story_id),
    'storySoFarThrough', c.story_so_far_through,
    'messages', (
        SELECT coalesce(json_agg(json_build_object(
            'position', m.position,
            'kind', m.kind,
            'text', m.text,
            'identityName', m.identity_name,
            'parts', (
                SELECT coalesce(json_agg(json_build_object('position', mp.position, 'kind', mp.kind, 'speakerName', mp.speaker_name, 'text', mp.text) ORDER BY mp.position), '[]'::json)
                FROM message_part mp WHERE mp.message_id = m.id
            )
        ) ORDER BY m.position), '[]'::json)
        FROM message m WHERE m.chat_id = c.id
    ),
    'details', (
        SELECT coalesce(json_agg(json_build_object(
            'kind', d.kind,
            'value', d.value,
            'characterName', (SELECT ch.name FROM character ch WHERE ch.id = d.character_id),
            'position', (SELECT m.position FROM message m WHERE m.id = d.message_id)
        ) ORDER BY d.id), '[]'::json)
        FROM detail_change d WHERE d.chat_id = c.id AND d.kind IN ('item', 'fact')
    )
) FROM chat c WHERE c.id = ${chatId};
ROLLBACK;`;
}

/** The copy from what psql printed: the one line that is JSON. Throws when there is none. */
export function parseExport(printed, chatId) {
    const line = printed
        .split(/\r?\n/)
        .map((one) => one.trim())
        .find((one) => one.startsWith('{'));
    if (!line) throw new Error(`Chat ${chatId}: the VM answered no copy. Is there such a Chat?`);
    const chat = JSON.parse(line);
    if (chat.chatId !== chatId || !Array.isArray(chat.messages)) throw new Error(`Chat ${chatId}: the copy is not of that Chat.`);
    return chat;
}

/**
 * Copies each Chat. `world` holds what it touches, so its test reaches no VM: `read(sql)` runs the
 * SQL on the VM and answers what psql printed; `write(name, text)` saves a file under the input
 * folder; `log(line)`.
 */
export function exportChats(ids, world) {
    const done = [];
    for (const id of ids) {
        const chat = parseExport(world.read(exportSql(id)), id);
        world.write(`chat-${id}.json`, `${JSON.stringify(chat, null, 2)}\n`);
        const parts = chat.messages.reduce((sum, message) => sum + message.parts.length, 0);
        world.log(`Chat ${id}: ${chat.messages.length} Messages, ${parts} reply parts, ${chat.castNames.length} Characters, ${(chat.details ?? []).length} Items and Facts, saved as chat-${id}.json.`);
        done.push({ id, messages: chat.messages.length });
    }
    return done;
}

function openSsh(tool) {
    const shipped = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH', `${tool}.exe`) : '';
    return shipped && existsSync(shipped) ? shipped : tool;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const fail = (line) => {
        console.error(line);
        process.exit(1);
    };
    const envFile = path.join(root, '.env.vm');
    if (!existsSync(envFile)) fail(`No ${envFile}: it holds VM_SSH and VM_SSH_KEY.`);
    const settings = parseEnv(readFileSync(envFile, 'utf8'));
    for (const name of ['VM_SSH', 'VM_SSH_KEY']) if (!settings[name]) fail(`${name} is not set in ${envFile}.`);
    const key = settings.VM_SSH_KEY.replace(/^~(?=[/\\])/, process.env.USERPROFILE ?? process.env.HOME ?? '~');
    const ids = process.argv.slice(2).map(Number);
    if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id < 1)) fail('Name the Chat ids to copy, e.g. node scripts/export-chat.mjs 1 3 4');
    const dir = path.join(root, '.data', 'eval-inputs');
    mkdirSync(dir, { recursive: true });
    try {
        exportChats(ids, {
            read: (sql) => execFileSync(openSsh('ssh'), ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', settings.VM_SSH, PSQL], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }),
            write: (name, text) => writeFileSync(path.join(dir, name), text),
            log: (line) => console.log(line),
        });
    } catch (error) {
        fail(error.message.split('\n')[0]);
    }
}
