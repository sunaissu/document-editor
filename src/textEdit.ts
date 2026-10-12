/** A single input edit, expressed against the text the user actually saw. */
export function textEdit(before: string, after: string) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = before.length, nextEnd = after.length;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    return { start, end, insert: after.slice(start, nextEnd) };
}

/** Shift a caret through a replacement, keeping insertion affinity explicit. */
export function moveTextPosition(position: number, before: string, after: string, affinity: 'before' | 'after' = 'after') {
    const edit = textEdit(before, after);
    if (position < edit.start || (position === edit.start && affinity === 'before')) return position;
    if (position >= edit.end) return position + edit.insert.length - (edit.end - edit.start);
    return edit.start + edit.insert.length;
}
