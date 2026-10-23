import { renderToString } from "katex";
import type MarkdownIt from "markdown-it";

/** MathML needs no remote stylesheet or font and retains the original TeX annotation. */
export function renderDocumentMath(source: string, displayMode = false): string {
  if (!source.trim() || source.length > 4096) throw new Error("Use a nonempty equation of at most 4,096 characters.");
  let html: string;
  try { html = renderToString(source, { output: "mathml", displayMode, trust: false, strict: "error", throwOnError: true, maxExpand: 100, maxSize: 10, macros: {} }); } catch { throw new Error("This equation contains unsupported or invalid TeX."); }
  if (html.length > 128 * 1024) throw new Error("The rendered equation is too large.");
  return html;
}

export function installMath(parser: MarkdownIt) {
  const escape = parser.utils.escapeHtml;
  parser.inline.ruler.before("escape", "document_math", (state, silent) => {
    const open = state.src.startsWith("\\(", state.pos) ? "\\(" : state.src[state.pos] === "$" && state.src[state.pos + 1] !== "$" ? "$" : "";
    if (!open || (state.env.mathParseBudget ?? 131072) <= 0) return false;
    const close = open === "$" ? "$" : "\\)", start = state.pos + open.length;
    if (open === "$" && /\s/.test(state.src[start] ?? "")) return false;
    let end = start;
    for (; end < Math.min(state.src.length, start + 4097); end++) {
      state.env.mathParseBudget = (state.env.mathParseBudget ?? 131072) - 1;
      if (state.env.mathParseBudget <= 0 || state.src[end] === "\n") return false;
      if (state.src.startsWith(close, end)) break;
      if (state.src[end] === "\\") end++;
    }
    if (end === start || !state.src.startsWith(close, end) || open === "$" && (/\s/.test(state.src[end - 1]) || /\d/.test(state.src[end + 1] ?? ""))) return false;
    if (!silent) { const token = state.push("document_math", "", 0); token.content = state.src.slice(start, end); token.markup = open; }
    state.pos = end + close.length; return true;
  });
  parser.block.ruler.before("fence", "document_math_block", (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = (index: number) => state.src.slice(state.bMarks[index] + state.tShift[index], state.eMarks[index]);
    if (line(start).trim() !== "$$") return false;
    let next = start + 1;
    while (next < end && next - start <= 100 && line(next).trim() !== "$$") next++;
    if (next >= end || next - start > 100) return false;
    if (silent) return true;
    const token = state.push("document_math_block", "", 0); token.content = state.getLines(start + 1, next, state.blkIndent, false); token.block = true; token.map = [start, next + 1]; state.line = next + 1; return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
  const render: NonNullable<typeof parser.renderer.rules.document_math> = (tokens, index, _options, env, renderer) => {
    const token = tokens[index], block = token.type === "document_math_block";
    const source = block ? "$$\n" + token.content.replace(/\n$/, "") + "\n$$" : token.markup + token.content + (token.markup === "$" ? "$" : "\\)");
    const attrs = renderer.renderAttrs(token);
    if (env.renderMath && (env.mathCount = (env.mathCount || 0) + 1) <= 64 && (env.mathBytes = (env.mathBytes || 0) + token.content.length) <= 32768) {
      try { return `<${block ? "div" : "span"} class="document-math"${attrs}>${renderDocumentMath(token.content, block)}</${block ? "div" : "span"}>${block ? "\n" : ""}`; } catch { /* Keep invalid or unsupported math visible as literal source. */ }
    }
    return block ? `<pre data-raw-block="math"${attrs}>${escape(source)}</pre>\n` : `<code data-document-math="inline">${escape(source)}</code>`;
  };
  parser.renderer.rules.document_math = render; parser.renderer.rules.document_math_block = render;
}
