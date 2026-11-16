/**
 * The repeated-sentence habit of written dialogue (.scratch/natural-speech/line-repair.md), found
 * in code: a run of sentences in a speech line that open with the same words ("I had a whole
 * speech ready. I had stages. I had a sequence."), and clauses in one sentence that do ("always
 * reaching, always tugging, always breaking"). Plain talk ("Tavri. Breathe.", "I know. I'm sorry.
 * Come here.") is not it. Pure: no model is asked.
 *
 * A run is two or more sentences in a row opening with the same two words, past a one-word opener
 * such as "No," or "Oh,"; or three or more opening with the same word. A clause run is three or
 * more comma- or semicolon-separated clauses in one sentence opening with the same word. One thing
 * said again for weight ("She's counting. Tavri, she's counting.", "No. No. No.") is how people talk,
 * not the habit: a run whose sentences are all the same words is left alone. So is starting over
 * ("I can't—I can't breathe"), where each sentence before the last breaks off at a dash.
 */

/** A text's words, lower case, without quotes or punctuation. */
function rawWords(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[“”"‘’]/g, '')
        .replace(/[^a-z' ]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

/** A sentence's words, past a one-word opener such as "No," or "Oh,". */
function openingWords(sentence: string): string[] {
    const all = rawWords(sentence);
    return /^[A-Za-z']+,\s/.test(sentence.trim()) && all.length > 2 ? all.slice(1) : all;
}

/** The sentences of a speech line: split after . ! ? and …, and before a capital after a dash. */
export function sentencesOf(text: string): string[] {
    return text
        .split(/(?<=[.!?…])\s+|(?<=—)\s*(?=[A-Z])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

/** Each place the habit shows in a speech line, as the text of the run or the sentence; empty for none. */
export function repeatedOpenings(text: string): string[] {
    const found: string[] = [];
    const sentences = sentencesOf(text);
    let i = 0;
    while (i < sentences.length) {
        const first = openingWords(sentences[i]);
        const sameTwo = (sentence: string) => {
            const words = openingWords(sentence);
            return first.length >= 2 && words.length >= 2 && words[0] === first[0] && words[1] === first[1];
        };
        const saidAgain = (end: number) =>
            sentences.slice(i, end).every((sentence) => openingWords(sentence).join(' ') === first.join(' ')) ||
            sentences.slice(i, end - 1).every((sentence) => /[—–-]$/.test(sentence));
        let j = i + 1;
        while (j < sentences.length && sameTwo(sentences[j])) j++;
        if (j - i >= 2) {
            if (!saidAgain(j)) found.push(sentences.slice(i, j).join(' '));
            i = j;
            continue;
        }
        const sameOne = (sentence: string) => {
            const word = openingWords(sentence)[0];
            return word !== undefined && word === first[0];
        };
        j = i + 1;
        while (j < sentences.length && sameOne(sentences[j])) j++;
        if (j - i >= 3) {
            if (!saidAgain(j)) found.push(sentences.slice(i, j).join(' '));
            i = j;
            continue;
        }
        i++;
    }
    for (const sentence of sentences) {
        const clauses = sentence
            .split(/[,;]\s*/)
            .map((clause) => rawWords(clause))
            .filter((words) => words.length > 0);
        for (let k = 0; k + 2 < clauses.length; k++) {
            // Two clauses in a row opening with a word the clause before them also holds: "you're always
            // reaching, always tugging, always breaking", "you don't touch, you don't talk, you don't".
            const word = clauses[k + 1][0];
            if (word === clauses[k + 2][0] && clauses[k].slice(0, 2).includes(word)) {
                found.push(sentence);
                break;
            }
        }
    }
    return found;
}
