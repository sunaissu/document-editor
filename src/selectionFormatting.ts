export type FormatState = boolean | "mixed";
export interface SelectionFormats { bold: FormatState; italic: FormatState; strike: FormatState; code: FormatState }
export interface RichTextSelection { selected: boolean; formats: SelectionFormats; rect: { left: number; top: number; right: number; bottom: number } }

/** Read only the selected text, so a partially formatted range is not shown as fully formatted. */
export function getSelectionFormats(editor: HTMLElement, range: Range): SelectionFormats {
  const doc = editor.ownerDocument, view = doc.defaultView!;
  if (range.collapsed) {
    const node = range.startContainer, parent = node.nodeType === 1 ? node as Element : node.parentElement;
    return { bold: doc.queryCommandState("bold"), italic: doc.queryCommandState("italic"), strike: doc.queryCommandState("strikeThrough"), code: Boolean(parent?.closest("code") && !parent?.closest("pre")) };
  }
  const nodes: Text[] = [];
  const ancestor = range.commonAncestorContainer;
  if (ancestor.nodeType === 3) nodes.push(ancestor as Text);
  else {
    const walker = doc.createTreeWalker(ancestor, 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (range.intersectsNode(node) && node.textContent && !(range.startContainer === node && range.startOffset === node.textContent.length) && !(range.endContainer === node && range.endOffset === 0)) nodes.push(node as Text);
    }
  }
  const marks = nodes.filter(node => node.textContent).map(node => {
    const parent = node.parentElement!, style = view.getComputedStyle(parent);
    let strike = false;
    for (let element: HTMLElement | null = parent; element && element !== editor; element = element.parentElement) {
      if (element.matches("s, del, strike") || view.getComputedStyle(element).textDecorationLine.includes("line-through")) { strike = true; break; }
    }
    return { bold: style.fontWeight === "bold" || Number(style.fontWeight) >= 600, italic: /italic|oblique/.test(style.fontStyle), strike, code: Boolean(parent.closest("code") && !parent.closest("pre")) };
  });
  const state = (key: keyof SelectionFormats): FormatState => marks.length && marks.some(mark => mark[key]) ? marks.every(mark => mark[key]) ? true : "mixed" : false;
  return { bold: state("bold"), italic: state("italic"), strike: state("strike"), code: state("code") };
}
