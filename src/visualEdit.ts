import { moveSequencePosition, sequenceChanges, textEdit } from "./textEdit";

/**
 * Rendering Markdown normalizes equivalent spellings (*word* / _word_, escaped
 * punctuation, whitespace). Send only the user's DOM edits back to the original
 * source, so two peers do not both insert those unrelated normalization bytes.
 */
export function applyVisualEdit(
  source: string,
  renderedBase: string,
  renderedNext: string,
  canonicalize: (value: string) => string,
): string {
  if (renderedBase === renderedNext) return source;
  if (source === renderedBase) return renderedNext;
  const normalization = sequenceChanges(renderedBase, source);
  const edits = sequenceChanges(renderedBase, renderedNext);
  let result = source;
  for (const edit of edits.slice().reverse()) {
    // These are equivalent source spellings, not peer insertions. A boundary
    // before a closing format marker must remain before its original spelling.
    const start = moveSequencePosition(edit.start, normalization, "before");
    const end = moveSequencePosition(edit.end, normalization, "before");
    result = result.slice(0, start) + renderedNext.slice(edit.nextStart, edit.nextEnd) + result.slice(end);
  }
  if (canonicalize(result) === renderedNext) return result;

  // Ambiguous marker changes can overlap the same equivalent source region.
  // Retry with just the user's changed span; keep original text outside it.
  const edit = textEdit(renderedBase, renderedNext);
  const start = moveSequencePosition(edit.start, normalization, "before");
  const end = moveSequencePosition(edit.end, normalization, "before");
  result = source.slice(0, start) + edit.insert + source.slice(end);
  if (canonicalize(result) === renderedNext) return result;
  // A structural formatting change may require a different Markdown spelling.
  return renderedNext;
}
