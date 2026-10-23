const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const { MarkdownRenderer, markdownToEditorHtml, editorElementToMarkdown, renderDocumentMath } = require('../dist/index.js');
const preview = content => renderToStaticMarkup(React.createElement(MarkdownRenderer, { content }));
test('inline and block math render accessible MathML while visual round-trips retain TeX', () => {
 const dom = new JSDOM('<!doctype html>'); global.Node = dom.window.Node; global.HTMLElement = dom.window.HTMLElement;
 for (const source of [String.raw`Energy $E = mc^2$ today.`, String.raw`Value \(\frac{1}{2}\) here.`, '$$\n\\int_0^1 x^2 dx\n$$', '> $$\n> x^2\n> $$']) {
  assert.match(preview(source), /<math /); assert.match(preview(source), /annotation encoding="application\/x-tex"/);
  const node = dom.window.document.createElement('div'); node.innerHTML = markdownToEditorHtml(source);
  assert.equal(editorElementToMarkdown(node), source);
 }
 assert.doesNotMatch(preview('Price $20 and $30.'), /<math /);
 assert.doesNotMatch(preview('`$x$`\n\n```tex\n$x$\n```'), /<math /);
 assert.doesNotMatch(preview('\\$x\\$'), /<math /);
});
test('untrusted math cannot load resources, attach DOM attributes or expose unsafe errors', () => {
 const source = String.raw`\href{javascript:alert(1)}{x}\includegraphics{https://example.test/image}\htmlStyle{position:fixed}{x}`;
 const html = preview('$' + source + '$');
 assert.doesNotMatch(html, /<a\b|<img\b|style="position:fixed/);
 assert.throws(() => renderDocumentMath(String.raw`\badcommand{<script>alert(1)</script>}`), error => !error.message.includes('script') && /invalid/.test(error.message));
 assert.throws(() => renderDocumentMath('x'.repeat(4097)), /4,096/);
 assert.throws(() => renderDocumentMath(String.raw`\def\loop{\loop}\loop`), /invalid/);
 assert.doesNotMatch(preview('$<script>alert(1)</script>$'), /<script>/);
 assert.equal((preview(Array(80).fill('$x$').join(' ')).match(/<math /g) || []).length, 64);
});
