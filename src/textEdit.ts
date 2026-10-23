/** A single input edit, expressed against the text the user actually saw. */
export function textEdit(before: string, after: string) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = before.length, nextEnd = after.length;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    return { start, end, insert: after.slice(start, nextEnd) };
}

export interface SequenceChange {
    start: number;
    end: number;
    nextStart: number;
    nextEnd: number;
}

/**
 * Find separate replacements with a linear-space Myers diff. Keeping unchanged
 * islands matters: a selection between two edits must not jump to the second.
 */
export function sequenceChanges<T>(before: ArrayLike<T>, after: ArrayLike<T>): SequenceChange[] {
    const changes: SequenceChange[] = [];
    // Ordinary keystrokes cost little. Bound unrelated, very large replacements.
    let budget = 2_000_000;
    const replace = (start: number, end: number, nextStart: number, nextEnd: number) => {
        if (start === end && nextStart === nextEnd) return;
        const previous = changes[changes.length - 1];
        if (previous && previous.end === start && previous.nextEnd === nextStart) {
            previous.end = end; previous.nextEnd = nextEnd;
        } else changes.push({ start, end, nextStart, nextEnd });
    };
    const visit = (start: number, end: number, nextStart: number, nextEnd: number): void => {
        while (start < end && nextStart < nextEnd && before[start] === after[nextStart]) { start++; nextStart++; }
        while (end > start && nextEnd > nextStart && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
        const n = end - start, m = nextEnd - nextStart;
        if (!n || !m || budget <= 0) { replace(start, end, nextStart, nextEnd); return; }
        const maximum = Math.ceil((n + m) / 2), offset = maximum + 1;
        const forward = new Int32Array(2 * maximum + 3).fill(-1);
        const reverse = new Int32Array(2 * maximum + 3).fill(-1);
        forward[offset + 1] = reverse[offset + 1] = 0;
        const delta = n - m, odd = delta % 2 !== 0;
        const split = (x: number, y: number) => {
            if ((x === 0 && y === 0) || (x === n && y === m)) {
                replace(start, end, nextStart, nextEnd);
            } else {
                visit(start, start + x, nextStart, nextStart + y);
                visit(start + x, end, nextStart + y, nextEnd);
            }
        };
        for (let distance = 0; distance <= maximum; distance++) {
            for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
                if (--budget < 0) { replace(start, end, nextStart, nextEnd); return; }
                const index = offset + diagonal;
                let x = diagonal === -distance || (diagonal !== distance && forward[index - 1] < forward[index + 1])
                    ? forward[index + 1] : forward[index - 1] + 1;
                let y = x - diagonal;
                while (x < n && y < m && before[start + x] === after[nextStart + y]) { x++; y++; budget--; }
                forward[index] = x;
                const opposite = offset + delta - diagonal;
                if (odd && opposite >= 0 && opposite < reverse.length && reverse[opposite] !== -1 && x >= n - reverse[opposite]) {
                    split(x, y); return;
                }
            }
            for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
                if (--budget < 0) { replace(start, end, nextStart, nextEnd); return; }
                const index = offset + diagonal;
                let x = diagonal === -distance || (diagonal !== distance && reverse[index - 1] < reverse[index + 1])
                    ? reverse[index + 1] : reverse[index - 1] + 1;
                let y = x - diagonal;
                while (x < n && y < m && before[end - x - 1] === after[nextEnd - y - 1]) { x++; y++; budget--; }
                reverse[index] = x;
                const opposite = offset + delta - diagonal;
                if (!odd && opposite >= 0 && opposite < forward.length && forward[opposite] !== -1 && forward[opposite] >= n - x) {
                    split(forward[opposite], forward[opposite] - (delta - diagonal)); return;
                }
            }
        }
        replace(start, end, nextStart, nextEnd);
    };
    visit(0, before.length, 0, after.length);
    return changes;
}

export function moveSequencePosition(position: number, changes: SequenceChange[], affinity: 'before' | 'after' = 'after') {
    let shift = 0;
    for (const change of changes) {
        if (position < change.start || (position === change.start && affinity === 'before')) break;
        if (position < change.end) return change.nextEnd;
        shift += change.nextEnd - change.nextStart - (change.end - change.start);
    }
    return position + shift;
}

/** Shift a caret through every edit, keeping insertion affinity explicit. */
export function moveTextPosition(position: number, before: string, after: string, affinity: 'before' | 'after' = 'after') {
    return moveSequencePosition(position, sequenceChanges(before, after), affinity);
}
