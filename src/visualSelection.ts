import { moveSequencePosition, sequenceChanges } from "./textEdit";
import { editorElementToMarkdown } from "./markdown";

interface Point { node: Node; offset: number }
interface Projection {
  tokens: string[];
  offsets: Map<Node, number[]>;
  points: Map<number, Point>;
}

const blockTags = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TR|TD|TH|HR)$/;
const emptyDraftTags = /^(P|DIV)$/;

/** Include structural boundaries so adjacent paragraphs and empty lines differ. */
function project(root: HTMLElement): Projection {
  const tokens: string[] = [], offsets = new Map<Node, number[]>(), points = new Map<number, Point>();
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const value = node.textContent || "";
      // Markdown's inter-block HTML newlines are not editable text.
      const ignored = !value.trim() && Boolean(node.parentElement &&
        (node.parentElement === root || Array.from(node.parentElement.children).some(child => blockTags.test(child.tagName))));
      const positions: number[] = [];
      for (let index = 0; index <= value.length; index++) {
        positions.push(tokens.length);
        if (!ignored) {
          points.set(tokens.length, { node, offset: index });
          if (index < value.length) tokens.push(value[index]);
        }
      }
      offsets.set(node, positions);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    const block = node !== root && blockTags.test(element.tagName);
    if (block) tokens.push(`<${element.tagName}>`);
    const positions = [tokens.length];
    if (element.tagName === "BR" || element.tagName === "IMG" || element.contentEditable === "false") {
      tokens.push(`<${element.tagName}:${element.getAttribute("src") || element.textContent || ""}>`);
    } else {
      if (!points.has(tokens.length)) points.set(tokens.length, { node, offset: 0 });
      Array.from(node.childNodes).forEach((child, index) => {
        visit(child);
        positions.push(tokens.length);
        if (!points.has(tokens.length)) points.set(tokens.length, { node, offset: index + 1 });
      });
    }
    offsets.set(node, positions);
    if (block) tokens.push(`</${element.tagName}>`);
  };
  visit(root);
  return { tokens, offsets, points };
}

interface EmptyDraft {
  element: HTMLElement;
  parent: HTMLElement;
  parentPosition: number;
  relativePath: number[];
  offset: number;
}
/** Full equivalent run bounds, with only its uncommitted characters in value. */
interface WhitespaceDraft { start: number; end: number; value: string }
export interface VisualSelectionSnapshot {
  projection: Projection;
  anchor: number;
  focus: number;
  anchorDraft?: EmptyDraft;
  focusDraft?: EmptyDraft;
  whitespace: WhitespaceDraft[];
}

function emptyDraft(root: HTMLElement, projection: Projection, node: Node, offset: number): EmptyDraft | undefined {
  let element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
  while (element && element !== root) {
    if (emptyDraftTags.test(element.tagName) && !element.textContent?.trim() &&
      !element.querySelector("img,hr,table,[contenteditable=false]")) {
      const wrapper = root.ownerDocument.createElement("div");
      wrapper.appendChild(element.cloneNode(true));
      if (editorElementToMarkdown(wrapper)) return;
      const parent = element.parentElement!;
      const index = Array.prototype.indexOf.call(parent.childNodes, element);
      const position = projection.offsets.get(parent)?.[index];
      if (position === undefined) return;
      const relativePath: number[] = [];
      for (let current = node; current !== element; current = current.parentNode!) {
        relativePath.unshift(Array.prototype.indexOf.call(current.parentNode!.childNodes, current));
      }
      return { element, parent, parentPosition: position, relativePath, offset };
    }
    element = element.parentElement;
  }
}

export function captureVisualSelection(root: HTMLElement, persistedHtml?: string): VisualSelectionSnapshot | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode ||
    !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const projection = project(root);
  const anchor = projection.offsets.get(selection.anchorNode)?.[selection.anchorOffset];
  const focus = projection.offsets.get(selection.focusNode)?.[selection.focusOffset];
  if (anchor === undefined || focus === undefined) return null;
  const whitespace: WhitespaceDraft[] = [];
  if (persistedHtml !== undefined) {
    const persisted = root.ownerDocument.createElement("div");
    persisted.innerHTML = persistedHtml;
    const baseline = project(persisted);
    for (const change of sequenceChanges(projection.tokens, baseline.tokens)) {
      const removed = projection.tokens.slice(change.start, change.end);
      const inserted = baseline.tokens.slice(change.nextStart, change.nextEnd);
      // Serializer-trimmed spaces are local drafts. Compare with the last
      // emitted document so a peer's deletion of committed spaces stays deleted.
      // Allow a closing P/DIV normalization next to the run, but never extract
      // spaces from an entire empty block (that is handled by EmptyDraft).
      if (inserted.some(token => token.length === 1) ||
        removed.some(token => token.length === 1 && !/^[ \t\u00a0]$/.test(token)) ||
        removed.some(token => /^<[A-Z]/.test(token))) continue;
      let start = change.start;
      while (start < change.end) {
        if (!/^[ \t\u00a0]$/.test(projection.tokens[start])) { start++; continue; }
        let end = start + 1;
        while (end < change.end && /^[ \t\u00a0]$/.test(projection.tokens[end])) end++;
        let runStart = start, runEnd = end;
        while (runStart > 0 && /^[ \t\u00a0]$/.test(projection.tokens[runStart - 1])) runStart--;
        while (runEnd < projection.tokens.length && /^[ \t\u00a0]$/.test(projection.tokens[runEnd])) runEnd++;
        const existing = whitespace.find(draft => draft.start === runStart && draft.end === runEnd);
        const value = projection.tokens.slice(start, end).join("");
        if (existing) existing.value += value;
        else whitespace.push({ start: runStart, end: runEnd, value });
        start = end;
      }
    }
  }
  return {
    projection, anchor, focus, whitespace,
    anchorDraft: emptyDraft(root, projection, selection.anchorNode, selection.anchorOffset),
    focusDraft: emptyDraft(root, projection, selection.focusNode, selection.focusOffset),
  };
}

function pointAt(projection: Projection, position: number): Point {
  const exact = projection.points.get(position);
  if (exact) return exact;
  // A deleted block boundary may have no DOM insertion point of its own.
  for (let distance = 1; distance <= projection.tokens.length + 1; distance++) {
    const next = projection.points.get(position + distance) || projection.points.get(position - distance);
    if (next) return next;
  }
  return projection.points.values().next().value!;
}

/** Restore only this editor's selection; awareness never supplies these points. */
export function restoreVisualSelection(root: HTMLElement, snapshot: VisualSelectionSnapshot): Range {
  let projection = project(root);
  let changes = sequenceChanges(snapshot.projection.tokens, projection.tokens);
  const drafts = new Map<HTMLElement, HTMLElement>();
  // Empty paragraphs do not serialize to Markdown yet. Keep the user's active
  // draft block locally until its first character can enter the shared document.
  for (const draft of [snapshot.anchorDraft, snapshot.focusDraft]) {
    if (!draft || drafts.has(draft.element)) continue;
    const correspondingElement = (old: HTMLElement): HTMLElement | undefined => {
      if (old === root) return root;
      const start = snapshot.projection.offsets.get(old)?.[0];
      if (start === undefined) return;
      const mapped = moveSequencePosition(start, changes, "before");
      return Array.from(projection.offsets.keys()).find(node => node.nodeType === 1 &&
        (node as HTMLElement).tagName === old.tagName && projection.offsets.get(node)?.[0] === mapped) as HTMLElement | undefined;
    };
    const existing = correspondingElement(draft.element);
    if (existing && !existing.textContent?.trim()) { drafts.set(draft.element, existing); continue; }
    const position = moveSequencePosition(draft.parentPosition, changes, "before");
    const point = pointAt(projection, position);
    let target = point.node.nodeType === 1 ? point.node as HTMLElement : point.node.parentElement!;
    while (target.parentElement && target.parentElement !== root && !blockTags.test(target.tagName)) target = target.parentElement;
    const clone = draft.element.cloneNode(true) as HTMLElement;
    const parent = correspondingElement(draft.parent);
    if (parent) {
      const boundaries = projection.offsets.get(parent)!;
      let index = boundaries.findIndex(boundary => boundary >= position);
      if (index < 0) index = parent.childNodes.length;
      parent.insertBefore(clone, parent.childNodes[index] || null);
    } else if (point.node === root) root.insertBefore(clone, root.childNodes[point.offset] || null);
    else if (blockTags.test(target.tagName) && target !== root) {
      // The mapped boundary before a block belongs before that block; an end
      // position belongs after it, including a trailing empty paragraph.
      const start = projection.offsets.get(target)?.[0] ?? position;
      target.parentNode!.insertBefore(clone, position <= start ? target : target.nextSibling);
    } else root.appendChild(clone);
    drafts.set(draft.element, clone);
    projection = project(root);
    changes = sequenceChanges(snapshot.projection.tokens, projection.tokens);
  }
  const missingWhitespace = snapshot.whitespace.flatMap(draft => {
    const remaining = new Map<string, number>();
    for (const character of draft.value) remaining.set(character, (remaining.get(character) || 0) + 1);
    return changes.flatMap(change => {
      const start = Math.max(draft.start, change.start), end = Math.min(draft.end, change.end);
      const missing: Array<{ start: number; value: string }> = [];
      for (let index = start; index < end; index++) {
        const character = snapshot.projection.tokens[index], count = remaining.get(character) || 0;
        if (!count) continue;
        remaining.set(character, count - 1);
        const previous = missing[missing.length - 1];
        if (previous && previous.start + previous.value.length === index) previous.value += character;
        else missing.push({ start: index, value: character });
      }
      return missing;
    });
  });
  for (const missing of missingWhitespace.slice().reverse()) {
    // Restore only characters absent from the remote rendering. A peer may
    // already have inserted an equivalent space at this exact boundary.
    const position = moveSequencePosition(missing.start, changes, "before");
    const point = pointAt(projection, position);
    if (point.node.nodeType === 3) {
      (point.node as Text).insertData(point.offset, missing.value);
    } else {
      const text = root.ownerDocument.createTextNode(missing.value);
      point.node.insertBefore(text, point.node.childNodes[point.offset] || null);
    }
    projection = project(root);
    changes = sequenceChanges(snapshot.projection.tokens, projection.tokens);
  }
  const endpoint = (position: number, draft?: EmptyDraft): Point => {
    const clone = draft && drafts.get(draft.element);
    if (clone && draft) {
      let node: Node = clone;
      for (const index of draft.relativePath) node = node.childNodes[index] || node;
      return { node, offset: Math.min(draft.offset, node.nodeType === 3 ? (node.textContent?.length || 0) : node.childNodes.length) };
    }
    if (snapshot.whitespace.some(draft => position >= draft.start && position <= draft.end)) {
      // Keep the local insertion point before peer text appended after a draft.
      return pointAt(projection, moveSequencePosition(position, changes, "before"));
    }
    return pointAt(projection, moveSequencePosition(position, changes));
  };
  const anchor = endpoint(snapshot.anchor, snapshot.anchorDraft), focus = endpoint(snapshot.focus, snapshot.focusDraft);
  const selection = root.ownerDocument.getSelection()!;
  selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  return selection.getRangeAt(0);
}
