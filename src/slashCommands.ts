export interface SlashCommand {
  id: string; label: string; detail: string; group: string; keywords?: string;
  markdown?: string; action?: "link" | "image" | "find" | "outline";
}
const fence = String.fromCharCode(96).repeat(3);
export const slashCommands: SlashCommand[] = [
  { id: "text", label: "Text", detail: "A plain paragraph", group: "Basic", markdown: "Text", keywords: "paragraph normal" },
  ...Array.from({ length: 6 }, (_, index) => ({ id: "h" + (index + 1), label: "Heading " + (index + 1), detail: index === 0 ? "A large section title" : "A level " + (index + 1) + " heading", group: "Headings", keywords: "h" + (index + 1) + " title", markdown: "#".repeat(index + 1) + " Heading " + (index + 1) })),
  { id: "bullet", label: "Bullet list", detail: "An unordered list", group: "Lists", keywords: "ul bullets unordered", markdown: "- List item" },
  { id: "numbered", label: "Numbered list", detail: "Steps in order", group: "Lists", keywords: "ol ordered steps", markdown: "1. List item" },
  { id: "task", label: "Task list", detail: "A checkable to-do", group: "Lists", keywords: "todo checkbox checklist", markdown: "- [ ] Task" },
  { id: "quote", label: "Quote", detail: "A block quotation", group: "Blocks", markdown: "> Quote" },
  { id: "code", label: "Code block", detail: "A block of plain code", group: "Blocks", keywords: "pre snippet", markdown: fence + "\ncode\n" + fence },
  { id: "javascript", label: "JavaScript code", detail: "A JavaScript code fence", group: "Code", keywords: "js", markdown: fence + "js\n// Your code\n" + fence },
  { id: "python", label: "Python code", detail: "A Python code fence", group: "Code", keywords: "py", markdown: fence + "python\n# Your code\n" + fence },
  { id: "json", label: "JSON code", detail: "A JSON code fence", group: "Code", markdown: fence + "json\n{\n  \"key\": \"value\"\n}\n" + fence },
  { id: "bold", label: "Bold text", detail: "Start with bold text", group: "Text", markdown: "**Bold text**" },
  { id: "italic", label: "Italic text", detail: "Start with italic text", group: "Text", markdown: "_Italic text_" },
  { id: "strike", label: "Strikethrough", detail: "Text with a line through it", group: "Text", markdown: "~~Text~~" },
  { id: "inline-code", label: "Inline code", detail: "A short code fragment", group: "Text", markdown: String.fromCharCode(96) + "code" + String.fromCharCode(96) },
  { id: "divider", label: "Divider", detail: "A horizontal rule", group: "Blocks", keywords: "hr separator line", markdown: "---" },
  { id: "table", label: "Table", detail: "Two columns with a header", group: "Blocks", keywords: "grid columns", markdown: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n|  |  |" },
  { id: "link", label: "Link", detail: "Add a link with a label", group: "Insert", action: "link", keywords: "url hyperlink" },
  { id: "image", label: "Image", detail: "Insert an image by URL", group: "Insert", action: "image", keywords: "photo picture" },
  { id: "note", label: "Note", detail: "A note in a quoted block", group: "Templates", markdown: "> **Note**\n>\n> Add your note here." },
  { id: "warning", label: "Warning", detail: "Highlight something to watch for", group: "Templates", markdown: "> **Warning**\n>\n> Describe what needs attention." },
  { id: "meeting", label: "Meeting notes", detail: "Agenda, notes, and action items", group: "Templates", markdown: "## Meeting notes\n\n### Agenda\n\n- Topic\n\n### Notes\n\nAdd notes here.\n\n### Action items\n\n- [ ] Action — owner" },
  { id: "decision", label: "Decision record", detail: "Context, decision, and consequences", group: "Templates", markdown: "## Decision\n\n### Context\n\nDescribe the problem.\n\n### Decision\n\nRecord the choice.\n\n### Consequences\n\n- Trade-off" },
  { id: "pros-cons", label: "Pros and cons", detail: "Compare advantages and drawbacks", group: "Templates", markdown: "| Pros | Cons |\n| --- | --- |\n| Advantage | Drawback |" },
  { id: "summary", label: "Summary", detail: "Key points and next steps", group: "Templates", markdown: "## Summary\n\n- Key point\n\n### Next steps\n\n- [ ] Next step" },
  { id: "find", label: "Find and replace", detail: "Search within this document", group: "Navigate", keywords: "search", action: "find" },
  { id: "outline", label: "Outline", detail: "Browse the document headings", group: "Navigate", keywords: "contents navigation", action: "outline" },
];
export function filterSlashCommands(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/);
  return slashCommands.filter(command => terms.every(term => (command.label + " " + command.group + " " + (command.keywords || "")).toLowerCase().includes(term)));
}
export function getSourceSlash(value: string, caret: number) {
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const match = value.slice(start, caret).match(/^\/([\w -]{0,40})$/);
  if (!match || (value[caret] && value[caret] !== "\n")) return null;
  let fence: { marker: string; length: number } | null = null;
  for (const line of value.slice(0, start).split("\n")) {
    const marker = line.match(/^ {0,3}(\x60{3,}|~{3,})(.*)$/);
    if (!marker) continue;
    if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
    else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
  }
  return fence ? null : { query: match[1], start, end: caret };
}
export function getVisualSlash(editor: HTMLElement) {
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  const element = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer as HTMLElement;
  if (element?.closest("pre, code, [contenteditable=false]")) return null;
  const block = element?.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6, div");
  if (!block || !editor.contains(block)) return null;
  const before = range.cloneRange(); before.selectNodeContents(block); before.setEnd(range.startContainer, range.startOffset);
  const match = before.toString().match(/^\/([\w -]{0,40})$/);
  if (!match || block.textContent !== before.toString()) return null;
  return { query: match[1], block, range: before };
}
