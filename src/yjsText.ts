import * as Y from 'yjs';
import { sequenceChanges } from './textEdit';

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

function deltaBetween(before: string, after: string): Delta {
    const delta: Delta = [];
    let cursor = 0;
    for (const change of sequenceChanges(before, after)) {
        if (change.start > cursor) delta.push({ retain: change.start - cursor });
        if (change.nextEnd > change.nextStart) delta.push({ insert: after.slice(change.nextStart, change.nextEnd) });
        if (change.end > change.start) delta.push({ delete: change.end - change.start });
        cursor = change.end;
    }
    return delta;
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
    if (base === next) return;
    let deltas: Delta[] = [];
    if (base !== text.toString()) {
        const journal = journals.get(text)!;
        let index = journal.length - 1;
        while (index >= 0 && journal[index].before !== base) index--;
        deltas = index >= 0 ? journal.slice(index).map(entry => entry.delta) : [deltaBetween(base, text.toString())];
    }
    // Apply from the end so each edit keeps its coordinates in the same snapshot.
    // Unchanged characters retain their CRDT identity across disjoint edits.
    for (const local of sequenceChanges(base, next).reverse()) {
        let position = local.start;
        let ranges: Range[] = local.end > local.start ? [[local.start, local.end]] : [];
        for (const delta of deltas) ({ position, ranges } = transform(position, ranges, delta));
        for (const [start, end] of ranges.slice().reverse()) {
            text.delete(start, end - start);
            if (start < position) position -= Math.min(end, position) - start;
        }
        const insert = next.slice(local.nextStart, local.nextEnd);
        if (insert) text.insert(position, insert);
    }
}
