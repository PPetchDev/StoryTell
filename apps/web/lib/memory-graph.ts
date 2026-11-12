import { Memory, MemoryList } from './memory';

/**
 * The Memory graph (CONTEXT.md: "Memory graph"): the worn identity and the Characters as people, each
 * active Memory as a dot linked to the people it is about. Who a Memory is about is read from its
 * text on the client: `{user}` or the worn identity's name is the user, and a Character's name is
 * that Character. A Memory that names nobody is linked to the Characters who know it instead.
 * Presentation only: nothing is stored.
 */

/** A person in the graph: the worn identity, or a Character by id. */
export type Person = 'user' | number;

/** Letters and digits that make a Latin name part of a longer word ("Ash" in "Ashes"). */
const WORD = '[A-Za-z0-9]';

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `name` appears in `text` as a name, ignoring case. A Latin name must stand as a whole
 * word, possessives included ("Nara's"); a name in a script without spaces (Thai) matches anywhere.
 */
export function namesIn(text: string, name: string): boolean {
    const trimmed = name.trim();
    if (trimmed === '') return false;
    return new RegExp(`(?<!${WORD})${escapeRegExp(trimmed)}(?!${WORD})`, 'i').test(text);
}

/** The people a Memory is about, the user first and then Characters in cast order. */
export function memoryAbout(memory: Pick<Memory, 'text' | 'knownBy'>, list: Pick<MemoryList, 'cast' | 'identityName'>): Person[] {
    const about: Person[] = [];
    if (memory.text.includes('{user}') || namesIn(memory.text, list.identityName)) about.push('user');
    for (const character of list.cast) {
        if (namesIn(memory.text, character.name)) about.push(character.id);
    }
    if (about.length > 0) return about;
    return list.cast.filter((character) => memory.knownBy.includes(character.id)).map((character) => character.id);
}

export interface GraphPoint {
    x: number;
    y: number;
}

export interface MemoryGraphLayout {
    width: number;
    height: number;
    people: Map<Person, GraphPoint>;
    memories: Map<number, GraphPoint>;
}

interface Body extends GraphPoint {
    vx: number;
    vy: number;
    /** A person pushes harder and moves less than a Memory dot. */
    heavy: boolean;
    radius: number;
}

export const PERSON_RADIUS = 22;
export const MEMORY_RADIUS = 7;

/**
 * Places the people and the Memory dots with a small force layout: everything repels, links
 * pull a dot toward its people, and a soft pull keeps it all near the middle. It starts from
 * fixed positions and runs a fixed number of steps, so the same Memories and links always give
 * the same picture, and an edit that changes no link leaves every dot where it was.
 */
export function layoutMemoryGraph(
    people: readonly Person[],
    memories: readonly { id: number; about: readonly Person[] }[],
    width = 360,
    height = 380,
): MemoryGraphLayout {
    const cx = width / 2;
    const cy = height / 2;
    const ring = Math.min(width, height) * 0.38;

    const personBodies = new Map<Person, Body>();
    people.forEach((person, index) => {
        // The worn identity in the middle; the Characters round it, the first at the top.
        const characters = people.length - 1;
        const angle = -Math.PI / 2 + (2 * Math.PI * Math.max(index - 1, 0)) / Math.max(characters, 1);
        const atCentre = person === 'user';
        personBodies.set(person, {
            x: atCentre ? cx : cx + ring * Math.cos(angle),
            y: atCentre ? cy : cy + ring * Math.sin(angle),
            vx: 0,
            vy: 0,
            heavy: true,
            radius: PERSON_RADIUS,
        });
    });

    const memoryBodies = new Map<number, Body>();
    memories.forEach((memory, index) => {
        const anchors = memory.about.map((person) => personBodies.get(person)).filter((body): body is Body => !!body);
        const ax = anchors.length ? anchors.reduce((sum, body) => sum + body.x, 0) / anchors.length : cx;
        const ay = anchors.length ? anchors.reduce((sum, body) => sum + body.y, 0) / anchors.length : cy;
        // Spread on a golden-angle spiral round the anchor, so no two dots start on the same spot.
        const angle = index * 2.399963;
        const spread = 18 + 4 * Math.sqrt(index);
        memoryBodies.set(memory.id, {
            x: ax + spread * Math.cos(angle),
            y: ay + spread * Math.sin(angle),
            vx: 0,
            vy: 0,
            heavy: false,
            radius: MEMORY_RADIUS,
        });
    });

    const bodies = [...personBodies.values(), ...memoryBodies.values()];
    const links = memories.flatMap((memory) =>
        memory.about
            .map((person) => personBodies.get(person))
            .filter((body): body is Body => !!body)
            .map((person) => ({ memory: memoryBodies.get(memory.id)!, person })),
    );

    const STEPS = 320;
    for (let step = 0; step < STEPS; step++) {
        const heat = 1 - step / STEPS;
        // Every pair repels, harder when a person is one of them.
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const a = bodies[i];
                const b = bodies[j];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let distance2 = dx * dx + dy * dy;
                if (distance2 < 0.01) {
                    dx = 0.1 * (i - j);
                    dy = 0.1;
                    distance2 = dx * dx + dy * dy;
                }
                const strength = (a.heavy || b.heavy ? 1100 : 480) / distance2;
                const distance = Math.sqrt(distance2);
                const fx = (dx / distance) * strength;
                const fy = (dy / distance) * strength;
                a.vx -= fx;
                a.vy -= fy;
                b.vx += fx;
                b.vy += fy;
            }
        }
        // Links pull a dot toward each of its people, to a short rest length.
        for (const { memory, person } of links) {
            const dx = person.x - memory.x;
            const dy = person.y - memory.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const pull = (distance - 56) * 0.035;
            memory.vx += (dx / distance) * pull;
            memory.vy += (dy / distance) * pull;
            person.vx -= (dx / distance) * pull * 0.15;
            person.vy -= (dy / distance) * pull * 0.15;
        }
        for (const body of bodies) {
            body.vx += (cx - body.x) * 0.0025;
            body.vy += (cy - body.y) * 0.0025;
            const damping = body.heavy ? 0.35 : 0.6;
            body.x += Math.max(-12, Math.min(12, body.vx * damping * heat));
            body.y += Math.max(-12, Math.min(12, body.vy * damping * heat));
            body.vx *= 0.5;
            body.vy *= 0.5;
        }
    }

    // Keep every node, with its name under a person, inside the picture.
    const clamp = (body: Body, below: number) => ({
        x: Math.min(width - body.radius - 2, Math.max(body.radius + 2, body.x)),
        y: Math.min(height - body.radius - below, Math.max(body.radius + 2, body.y)),
    });
    return {
        width,
        height,
        people: new Map([...personBodies].map(([person, body]) => [person, clamp(body, 18)])),
        memories: new Map([...memoryBodies].map(([id, body]) => [id, clamp(body, 2)])),
    };
}

/** A tap's nearest target needs its centre (or line) this close, in screen px: a 44px target (audit H19). */
export const HIT_RADIUS_PX = 22;

/**
 * A Bond's line from one person to another: a quadratic curve bowed to the right of its direction,
 * so the two Bonds between a pair bow apart rather than lying on each other. `control` is its bend.
 */
export function bondCurve(from: GraphPoint, to: GraphPoint): { from: GraphPoint; control: GraphPoint; to: GraphPoint } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const bow = Math.min(22, length * 0.18);
    return {
        from,
        control: { x: (from.x + to.x) / 2 - (dy / length) * bow, y: (from.y + to.y) / 2 + (dx / length) * bow },
        to,
    };
}

/** The curve as an SVG path. */
export function bondCurvePath(from: GraphPoint, to: GraphPoint): string {
    const curve = bondCurve(from, to);
    return `M ${from.x} ${from.y} Q ${curve.control.x} ${curve.control.y} ${to.x} ${to.y}`;
}

/** Something a tap can land on: a round node (a person or a Memory dot), or a Bond's curve. */
export type HitTarget<K> =
    | { key: K; kind: 'circle'; at: GraphPoint; radius: number }
    | { key: K; kind: 'curve'; from: GraphPoint; to: GraphPoint };

/** How far `point` is from a target: from a circle's edge (0 inside it), or from the nearest point of a curve. */
export function distanceTo<K>(target: HitTarget<K>, point: GraphPoint): number {
    if (target.kind === 'circle') return Math.max(0, Math.hypot(point.x - target.at.x, point.y - target.at.y) - target.radius);
    const { from, control, to } = bondCurve(target.from, target.to);
    let nearest = Infinity;
    const STEPS = 64;
    for (let step = 0; step <= STEPS; step++) {
        const t = step / STEPS;
        const u = 1 - t;
        const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
        const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
        nearest = Math.min(nearest, Math.hypot(point.x - x, point.y - y));
    }
    return nearest;
}

/**
 * The target a tap at `point` means (audit H19): the nearest one whose centre, or line, is within
 * `reach` (in graph units: 22px over the graph's scale), so every target takes a 44px tap however
 * small it is drawn, and of two overlapping targets the one nearer the finger wins. A circle counts
 * from its edge, so a person's large ring is reached as easily as a small dot's centre. None: null.
 */
export function nearestTarget<K>(targets: readonly HitTarget<K>[], point: GraphPoint, reach: number): K | null {
    let best: { key: K; score: number } | null = null;
    for (const target of targets) {
        const edge = distanceTo(target, point);
        // A dot is reached from its centre, a ring from its edge.
        const centre = target.kind === 'circle' ? edge + target.radius : edge;
        const limit = target.kind === 'circle' ? Math.max(reach, target.radius) : reach;
        if (centre > limit && edge > 0) continue;
        if (!best || edge < best.score) best = { key: target.key, score: edge };
    }
    return best?.key ?? null;
}
