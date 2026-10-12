import MarkdownIt from "markdown-it";

const parser = new MarkdownIt({ html: false, linkify: false });
const escapeHtml = parser.utils.escapeHtml;
const validateLink = parser.validateLink;
parser.core.ruler.after("block", "source_ranges", state => {
  const offsets: number[] | undefined = state.env.sourceOffsets;
  if (!offsets) return;
  for (const token of state.tokens) {
    if (!token.map || token.type === "inline" || token.nesting < 0) continue;
    token.attrSet("data-source-start", String(offsets[token.map[0]]));
    token.attrSet("data-source-end", String(offsets[token.map[1]] ?? state.env.sourceLength));
  }
});
parser.validateLink = link => validateLink(link) && (!/^[a-z][a-z\d+.-]*:/i.test(link) || /^(https?:|mailto:|tel:|data:image\/(png|jpeg|gif|webp);base64,)/i.test(link));
parser.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index].attrSet("href", safeDocumentLink(tokens[index].attrGet("href") || ""));
  return renderer.renderToken(tokens, index, options);
};

/** One URL policy for links entered in the editor and links loaded from Markdown. */
export function safeDocumentLink(value: string): string {
  const link = parser.normalizeLink(value.trim());
  return link && !/^data:/i.test(link) && parser.validateLink(link) && !/[\u0000-\u0020]/.test(link) ? link : "#";
}

export function safeDocumentImage(value: string): string {
  if (value.length > 8 * 1024 * 1024) return "#";
  const link = parser.normalizeLink(value.trim());
  if (!link || link.length > 8 * 1024 * 1024 || /[\u0000-\u0020]/.test(link)) return "#";
  if (/^data:/i.test(link)) {
    const payload = link.slice(link.indexOf(',') + 1);
    return /^data:image\/(png|jpeg|gif|webp);base64,/i.test(link) && payload.length % 4 === 0 && /^[a-z0-9+/]+={0,2}$/i.test(payload) ? link : "#";
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(link) && !/^https?:/i.test(link)) return "#";
  return parser.validateLink(link) ? link : "#";
}

parser.inline.ruler.before("link", "wikilink", (state, silent) => {
  const match = state.src.slice(state.pos).match(/^\[\[([^\]\n]+)\]\]/);
  if (!match) return false;
  if (!silent) state.push("wikilink", "span", 0).content = match[1];
  state.pos += match[0].length;
  return true;
});
parser.renderer.rules.wikilink = (tokens, index) => {
  const [destination, label = destination] = tokens[index].content.split("|");
  return '<span class="wikilink" data-wikilink="' + escapeHtml(destination) + '">' + escapeHtml(label) + '</span>';
};
parser.core.ruler.after("inline", "task_items", state => {
  state.tokens.forEach((token, index, tokens) => {
    if (token.type !== "inline" || tokens[index - 2]?.type !== "list_item_open") return;
    const first = token.children?.[0];
    const task = first?.type === "text" && first.content.match(/^\[([ xX])\]\s+/);
    if (!task || !first) return;
    const checked = task[1].toLowerCase() === "x";
    tokens[index - 2].attrSet("data-task", checked ? "checked" : "open");
    first.content = first.content.slice(task[0].length);
    const box = new state.Token("html_inline", "", 0);
    box.content = '<span class="rich-task-box" role="checkbox" aria-label="Task complete" aria-checked="' + checked + '" tabindex="0" contenteditable="false">' + (checked ? '✓' : '') + '</span>';
    token.children!.unshift(box);
  });
});
const fence = parser.renderer.rules.fence!;
parser.renderer.rules.fence = (tokens, index, options, env, renderer) => fence(tokens, index, options, env, renderer).replace("<pre>", '<pre data-language="' + escapeHtml(tokens[index].info.trim().split(/\s+/)[0]) + '">');
parser.renderer.rules.image = (tokens, index, options, _env, renderer) => {
  const altText = (children: typeof tokens): string => children.map(token => {
    if (token.type === "image") return altText(token.children || []);
    if (token.type === "softbreak" || token.type === "hardbreak") return " ";
    if (token.type === "wikilink") return token.content.split("|").pop() || "";
    return /^(text|text_special|code_inline|html_inline)$/.test(token.type) ? token.content : "";
  }).join("");
  tokens[index].attrSet("alt", altText(tokens[index].children || []));
  tokens[index].attrSet("src", safeDocumentImage(tokens[index].attrGet("src") || ""));
  tokens[index].attrSet("loading", "lazy");
  tokens[index].attrSet("class", "markdown-image");
  tokens[index].attrSet("referrerpolicy", "no-referrer");
  return renderer.renderToken(tokens, index, options);
};

/** Render CommonMark, tables, task lists and wiki links without accepting raw HTML. */
export function parseDocumentMarkdown(value: string, sourceMap = false): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const body = frontmatter ? normalized.slice(frontmatter[0].length) : normalized;
  const offsets = [0];
  if (sourceMap) {
    const newline = /\r\n|\r|\n/g;
    let match: RegExpExecArray | null;
    while ((match = newline.exec(value))) offsets.push(match.index + match[0].length);
  }
  const prefixLines = frontmatter ? (frontmatter[0].match(/\n/g) || []).length : 0;
  const environment = sourceMap ? { sourceOffsets: offsets.slice(prefixLines), sourceLength: value.length } : {};
  const prefixAttributes = sourceMap ? ` data-source-start="0" data-source-end="${offsets[prefixLines] ?? value.length}"` : "";
  return (frontmatter ? '<pre data-raw-block="frontmatter"' + prefixAttributes + '>' + escapeHtml(frontmatter[1]) + '</pre>\n' : '') + parser.render(body, environment);
}

export interface DocumentHeading { level: number; text: string; start: number; end: number }
export function getDocumentOutline(value: string): DocumentHeading[] {
  const prefix = value.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] || "";
  const body = value.slice(prefix.length), lines = body.split("\n");
  const offsets = [prefix.length];
  lines.forEach(line => offsets.push(offsets[offsets.length - 1] + line.length + 1));
  const tokens = parser.parse(body, {});
  return tokens.flatMap((token, index) => token.type === "heading_open" && token.map ? [{ level: Number(token.tag.slice(1)), text: tokens[index + 1].content, start: offsets[token.map[0]], end: Math.min(value.length, offsets[token.map[1]] - 1) }] : []);
}

export interface FindOptions { matchCase?: boolean; wholeWord?: boolean }
export function findDocumentMatches(value: string, query: string, options: FindOptions = {}): number[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), options.matchCase ? "gu" : "giu");
  const matches: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const index = match.index;
    if (!options.wholeWord || (!/[\p{L}\p{N}_]$/u.test(value.slice(Math.max(0, index - 2), index)) && !/^[\p{L}\p{N}_]/u.test(value.slice(index + match[0].length, index + match[0].length + 2)))) matches.push(index);
  }
  return matches;
}
