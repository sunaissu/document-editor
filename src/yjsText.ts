import * as Y from 'yjs';

type Delta = { retain?: number; delete?: number; insert?: unknown }[];
type Range = [number, number];
const journals = new WeakMap<Y.Text, { before: string; delta: Delta }[]>();

/** Track a bounded history so input based on a previous render can be rebased. */
export function trackText(text: Y.Text): void {
    if (journals.has(text)) return;
    let before = text.toString();
    const journal: { before: string; delta: Delta }[] = [];
    journals.set(text, journal);
    text.observe(event => {
        journal.push({ before, delta: event.delta });
        if (journal.length > 32) journal.shift();
        before = text.toString();
    });
}

function edit(before: string, after: string) {
    let start = 0, end = before.length, nextEnd = after.length;
    while (start < end && start < nextEnd && before[start] === after[start]) start++;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    return { start, end, insert: after.slice(start, nextEnd) };
}

function transform(position: number, ranges: Range[], delta: Delta) {
    let oldIndex = 0, newIndex = 0, anchor: number | undefined;
    const kept: Range[] = [];
    const retain = (length: number) => {
        if (anchor === undefined && position < oldIndex + length) anchor = newIndex + Math.max(0, position - oldIndex);
        for (const [start, end] of ranges) {
            const a = Math.max(start, oldIndex), b = Math.min(end, oldIndex + length);
            if (b > a) kept.push([newIndex + a - oldIndex, newIndex + b - oldIndex]);
        }
        oldIndex += length; newIndex += length;
    };
    for (const part of delta) {
        if (part.retain) retain(part.retain);
        if (part.insert !== undefined) newIndex += typeof part.insert === 'string' ? part.insert.length : 1;
        if (part.delete) {
            if (anchor === undefined && position < oldIndex + part.delete) anchor = newIndex;
            oldIndex += part.delete;
        }
    }
    retain(Math.max(position, ...ranges.map(range => range[1]), oldIndex) - oldIndex + 1);
    return { position: anchor!, ranges: kept };
}

/** Apply only the user's changed characters; never delete intervening peer insertions. */
export function applyTextEdit(text: Y.Text, base: string, next: string): void {
    trackText(text);
    const local = edit(base, next);
    if (base === next) return;
    let position = local.start, ranges: Range[] = local.end > local.start ? [[local.start, local.end]] : [];
    if (base !== text.toString()) {
        const journal = journals.get(text)!;
        let index = journal.length - 1;
        while (index >= 0 && journal[index].before !== base) index--;
        const remote = edit(base, text.toString());
        const deltas = index >= 0 ? journal.slice(index).map(entry => entry.delta) : [[{ retain: remote.start }, { insert: remote.insert }, { delete: remote.end - remote.start }]];
        for (const delta of deltas) ({ position, ranges } = transform(position, ranges, delta));
    }
    for (const [start, end] of ranges.slice().reverse()) {
        text.delete(start, end - start);
        if (start < position) position -= Math.min(end, position) - start;
    }
    if (local.insert) text.insert(position, local.insert);
}
