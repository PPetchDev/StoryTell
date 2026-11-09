import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThan } from 'typeorm';

import { ChatEntity } from '../chat/entities/chat.entity.js';
import { MessageEntity } from '../chat/entities/message.entity.js';
import { LedgerModelService } from '../ledger/ledger.service.js';

/** An old id → new id map, from the source Chat's rows to the Branch's. */
export type IdMap = Map<number, number>;

/**
 * What every copy step gets: the transaction's manager, the source and new Chat, the position
 * of the last Message the Branch keeps, and the id maps filled so far (Messages first, then
 * Memories). A step reads the source and writes only rows of the new Chat.
 */
export interface CopyContext {
    manager: EntityManager;
    sourceChatId: number;
    chatId: number;
    /** The position of Message N, the last one the Branch keeps. */
    through: number;
    messageIds: IdMap;
    memoryIds: IdMap;
}

export type CopyStep = (context: CopyContext) => Promise<void>;

/** The new Chat's own fields; everything else comes from the source. */
export interface BranchFields {
    title: string;
    /** The Message the user tapped, for the link back: a User Message itself when branched from one. */
    branchedFromMessageId: number;
}

/**
 * Branch's copy (.scratch/branch/spec.md, "How the copy reaches the state at Message N"): the
 * one place a Chat is copied. In one REPEATABLE READ transaction, so every read of the source
 * sees one snapshot, it makes the new Chat, copies everything the source owns in source id order
 * (so new ids keep the old relative order), rolls the copy back from N + 1 with the ledger's own
 * rollback, then deletes the copy's Messages after N. The Branch then holds exactly what an edit
 * of Message N + 1 would leave. A feature that adds per-Chat or per-Message data adds its own
 * step to `COPY_STEPS`, copying per-Message rows only for Messages at or before `through`.
 */
@Injectable()
export class BranchModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly ledger: LedgerModelService,
    ) {}

    /** Copies Chat `sourceChatId` as it stood at the Message at position `through`; returns the new Chat's id. */
    copy(sourceChatId: number, through: number, fields: BranchFields): Promise<number> {
        return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
            const chatId = await copyChat(manager, sourceChatId, through, fields);
            const context: CopyContext = { manager, sourceChatId, chatId, through, messageIds: new Map(), memoryIds: new Map() };
            for (const step of COPY_STEPS) await step(context);
            // The ledger's step ends here: undo every change the Messages after N caused.
            await this.ledger.rollbackFrom(chatId, through + 1, manager);
            await manager.delete(MessageEntity, { chatId, position: MoreThan(through) });
            return chatId;
        });
    }
}

/**
 * The Chat row: its Story, Scene, Time of day, worn identity and Author's note, and the Story so far only when
 * it covers nothing past N (the same test a rewind from N + 1 uses), with the link back to the
 * source. The new Chat gets its own `created_at` and `last_played_at`, so it heads the Chat list.
 */
async function copyChat(manager: EntityManager, sourceChatId: number, through: number, fields: BranchFields): Promise<number> {
    const source = await manager.findOneOrFail(ChatEntity, { where: { id: sourceChatId } });
    const keepStorySoFar = source.storySoFarThrough !== null && source.storySoFarThrough <= through;
    const inserted = await manager.insert(ChatEntity, {
        storyId: source.storyId,
        title: fields.title,
        branchedFromChatId: source.id,
        branchedFromMessageId: fields.branchedFromMessageId,
        currentSceneId: source.currentSceneId,
        timeOfDay: source.timeOfDay,
        personaId: source.personaId,
        // The user's own direction, not story state: copied as it stands now (.scratch/authors-note/spec.md).
        authorsNote: source.authorsNote,
        ...(keepStorySoFar
            ? {
                  storySoFar: source.storySoFar,
                  storySoFarThrough: source.storySoFarThrough,
                  storySoFarBy: source.storySoFarBy,
                  storySoFarUpdatedAt: source.storySoFarUpdatedAt,
                  storySoFarFailed: source.storySoFarFailed,
                  storySoFarCorrections: source.storySoFarCorrections,
              }
            : {}),
    });
    return inserted.identifiers[0].id as number;
}

/**
 * Every Message row, later ones included: the rollback finds its records through Messages at or
 * after the rewind position. They get fresh ids in source id order.
 */
const copyMessages: CopyStep = async ({ manager, sourceChatId, chatId, through, messageIds }) => {
    const rows: Array<{ id: number }> = await manager.query('SELECT "id" FROM "message" WHERE "chat_id" = $1 ORDER BY "id"', [sourceChatId]);
    mapInOrder(messageIds, rows.map((row) => row.id), await reserveIds(manager, 'message', rows.length));
    const [olds, news] = oldAndNewIds(messageIds);
    // Reply versions come along only from the newest Message (spec: "Reply versions").
    const newest: Array<{ position: number | null }> = await manager.query('SELECT max("position") AS "position" FROM "message" WHERE "chat_id" = $1', [sourceChatId]);
    const keepVersions = newest[0]?.position === through;
    await manager.query(
        `INSERT INTO "message" ("id", "chat_id", "position", "kind", "text", "identity_name", "persona_id", "model",
                "judge_status", "judge_error", "memory_status", "memory_error", "version_ordinal", "document_passages", "created_at")
         SELECT m."new_id", $1, s."position", s."kind", s."text", s."identity_name", s."persona_id", s."model",
                s."judge_status", s."judge_error", s."memory_status", s."memory_error",
                s."version_ordinal", s."document_passages", s."created_at"
         FROM "message" s JOIN unnest($3::int[], $4::int[]) AS m("old_id", "new_id") ON m."old_id" = s."id"
         WHERE s."chat_id" = $2 ORDER BY s."id"`,
        [chatId, sourceChatId, olds, news],
    );
    if (!keepVersions) return;
    await manager.query(
        `INSERT INTO "reply_version" ("message_id", "ordinal", "model", "parts", "written_at")
         SELECT m."new_id", r."ordinal", r."model", r."parts", r."written_at"
         FROM "reply_version" r JOIN "message" s ON s."id" = r."message_id"
         JOIN unnest($2::int[], $3::int[]) AS m("old_id", "new_id") ON m."old_id" = r."message_id"
         WHERE s."chat_id" = $1 AND s."position" = $4 ORDER BY r."id"`,
        [sourceChatId, olds, news, through],
    );
};

/** The parts of the Messages the Branch keeps; later Messages need only their rows. */
const copyMessageParts: CopyStep = async ({ manager, sourceChatId, through, messageIds }) => {
    const [olds, news] = oldAndNewIds(messageIds);
    await manager.query(
        `INSERT INTO "message_part" ("message_id", "position", "kind", "character_id", "speaker_name", "text")
         SELECT m."new_id", p."position", p."kind", p."character_id", p."speaker_name", p."text"
         FROM "message_part" p JOIN "message" s ON s."id" = p."message_id"
         JOIN unnest($2::int[], $3::int[]) AS m("old_id", "new_id") ON m."old_id" = p."message_id"
         WHERE s."chat_id" = $1 AND s."position" <= $4 ORDER BY p."id"`,
        [sourceChatId, olds, news, through],
    );
};

/**
 * Memories with their Known by, and every MemoryChange. A rolled-back delete puts a Memory back
 * under its recorded id, and that id is checked across Chats, so the Branch never shares one
 * with its source: every id the source mentions (live Memories, and deleted ones through their
 * MemoryChanges) gets a fresh id from the sequence, in ascending order.
 */
const copyMemories: CopyStep = async ({ manager, sourceChatId, chatId, messageIds, memoryIds }) => {
    const rows: Array<{ id: number }> = await manager.query(
        `SELECT "id" FROM "memory" WHERE "chat_id" = $1
         UNION SELECT "memory_id" FROM "memory_change" WHERE "chat_id" = $1
         ORDER BY 1`,
        [sourceChatId],
    );
    mapInOrder(memoryIds, rows.map((row) => row.id), await reserveIds(manager, 'memory', rows.length));
    const [messageOlds, messageNews] = oldAndNewIds(messageIds);
    const [memoryOlds, memoryNews] = oldAndNewIds(memoryIds);
    await manager.query(
        `INSERT INTO "memory" ("id", "chat_id", "text", "written_by", "locked", "archived", "message_id", "created_at")
         SELECT mm."new_id", $1, s."text", s."written_by", s."locked", s."archived", msg."new_id", s."created_at"
         FROM "memory" s JOIN unnest($3::int[], $4::int[]) AS mm("old_id", "new_id") ON mm."old_id" = s."id"
         LEFT JOIN unnest($5::int[], $6::int[]) AS msg("old_id", "new_id") ON msg."old_id" = s."message_id"
         WHERE s."chat_id" = $2 ORDER BY s."id"`,
        [chatId, sourceChatId, memoryOlds, memoryNews, messageOlds, messageNews],
    );
    await manager.query(
        `INSERT INTO "memory_known_by" ("memory_id", "character_id")
         SELECT mm."new_id", k."character_id"
         FROM "memory_known_by" k JOIN "memory" s ON s."id" = k."memory_id"
         JOIN unnest($2::int[], $3::int[]) AS mm("old_id", "new_id") ON mm."old_id" = k."memory_id"
         WHERE s."chat_id" = $1`,
        [sourceChatId, memoryOlds, memoryNews],
    );
    await manager.query(
        `INSERT INTO "memory_change" ("chat_id", "memory_id", "kind", "before", "after", "event", "message_id", "created_at")
         SELECT $1, mm."new_id", c."kind", c."before", c."after", c."event", msg."new_id", c."created_at"
         FROM "memory_change" c JOIN unnest($3::int[], $4::int[]) AS mm("old_id", "new_id") ON mm."old_id" = c."memory_id"
         JOIN unnest($5::int[], $6::int[]) AS msg("old_id", "new_id") ON msg."old_id" = c."message_id"
         WHERE c."chat_id" = $2 ORDER BY c."id"`,
        [chatId, sourceChatId, memoryOlds, memoryNews, messageOlds, messageNews],
    );
};

/**
 * The rest of the ledger: BondChanges (StartingBond seeds, with no Message, included), Arc steps,
 * Scene advances and Time changes with their Messages remapped, and the copied Arc directions
 * the source holds (not the Story's current ones).
 */
const copyLedger: CopyStep = async ({ manager, sourceChatId, chatId, messageIds }) => {
    const [olds, news] = oldAndNewIds(messageIds);
    const params = [chatId, sourceChatId, olds, news];
    const remap = `unnest($3::int[], $4::int[]) AS msg("old_id", "new_id") ON msg."old_id" = s."message_id"`;
    await manager.query(
        `INSERT INTO "bond_change" ("chat_id", "from_character_id", "to_character_id", "label", "description",
                "before_label", "before_description", "event", "message_id", "created_at")
         SELECT $1, s."from_character_id", s."to_character_id", s."label", s."description",
                s."before_label", s."before_description", s."event", msg."new_id", s."created_at"
         FROM "bond_change" s LEFT JOIN ${remap} WHERE s."chat_id" = $2 ORDER BY s."id"`,
        params,
    );
    await manager.query(
        `INSERT INTO "arc_step" ("chat_id", "character_id", "step", "event", "message_id", "created_at")
         SELECT $1, s."character_id", s."step", s."event", msg."new_id", s."created_at"
         FROM "arc_step" s JOIN ${remap} WHERE s."chat_id" = $2 ORDER BY s."id"`,
        params,
    );
    await manager.query(
        `INSERT INTO "scene_advance" ("chat_id", "from_scene_id", "from_scene_name", "to_scene_id", "to_scene_name", "event", "message_id", "created_at")
         SELECT $1, s."from_scene_id", s."from_scene_name", s."to_scene_id", s."to_scene_name", s."event", msg."new_id", s."created_at"
         FROM "scene_advance" s JOIN ${remap} WHERE s."chat_id" = $2 ORDER BY s."id"`,
        params,
    );
    await manager.query(
        `INSERT INTO "time_change" ("chat_id", "from_time", "to_time", "message_id", "created_at")
         SELECT $1, s."from_time", s."to_time", msg."new_id", s."created_at"
         FROM "time_change" s JOIN ${remap} WHERE s."chat_id" = $2 ORDER BY s."id"`,
        params,
    );
    await manager.query(
        `INSERT INTO "chat_arc_direction" ("chat_id", "character_id", "text")
         SELECT $1, s."character_id", s."text" FROM "chat_arc_direction" s WHERE s."chat_id" = $2 ORDER BY s."id"`,
        [chatId, sourceChatId],
    );
};

/**
 * Who is sitting out (.scratch/speaker-controls/spec.md): the user's choice, not story state, so
 * the Branch starts with the same people in play, as the source has them now.
 */
const copySittingOut: CopyStep = async ({ manager, sourceChatId, chatId }) => {
    await manager.query(
        `INSERT INTO "chat_sitting_out" ("chat_id", "character_id")
         SELECT $1, s."character_id" FROM "chat_sitting_out" s WHERE s."chat_id" = $2`,
        [chatId, sourceChatId],
    );
};


/**
 * Thai readings (.scratch/write-for-me/spec.md): copied with the Messages the Branch keeps, to
 * their new ids, fingerprints unchanged, since the copied Messages hold the same stored text.
 */
const copyThaiReadings: CopyStep = async ({ manager, sourceChatId, through, messageIds }) => {
    const [olds, news] = oldAndNewIds(messageIds);
    await manager.query(
        `INSERT INTO "thai_reading" ("message_id", "source_fingerprint", "text", "created_at")
         SELECT m."new_id", r."source_fingerprint", r."text", r."created_at"
         FROM "thai_reading" r JOIN "message" s ON s."id" = r."message_id"
         JOIN unnest($2::int[], $3::int[]) AS m("old_id", "new_id") ON m."old_id" = r."message_id"
         WHERE s."chat_id" = $1 AND s."position" <= $4 ORDER BY r."id"`,
        [sourceChatId, olds, news, through],
    );
};
/** In order: Messages before anything that points at them, Memories before their changes. */
const COPY_STEPS: CopyStep[] = [copyMessages, copyMessageParts, copyThaiReadings, copyMemories, copyLedger, copySittingOut];

/** `count` fresh ids from `table`'s id sequence, ascending. */
async function reserveIds(manager: EntityManager, table: string, count: number): Promise<number[]> {
    if (count === 0) return [];
    const rows: Array<{ id: number }> = await manager.query(
        `SELECT nextval(pg_get_serial_sequence($1, 'id'))::int AS "id" FROM generate_series(1, $2) ORDER BY 1`,
        [table, count],
    );
    return rows.map((row) => row.id);
}

/** Pairs ascending old ids with ascending new ids, so the new ones keep the old order. */
function mapInOrder(map: IdMap, olds: number[], news: number[]): void {
    olds.forEach((old, index) => map.set(old, news[index]));
}

function oldAndNewIds(map: IdMap): [number[], number[]] {
    return [[...map.keys()], [...map.values()]];
}
