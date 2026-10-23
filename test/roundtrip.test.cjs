const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const editor = require('../dist/index.js');
const dom = new JSDOM('<!doctype html>');
global.Node = dom.window.Node;
global.HTMLElement = dom.window.HTMLElement;
function roundtrip(markdown) {
  const root = dom.window.document.createElement('div');
  root.innerHTML = editor.markdownToEditorHtml(markdown);
  return editor.editorElementToMarkdown(root);
}
test('code payload retains blank lines and trailing spaces', () => {
  const code = '```js\na  \n\n\nb\n```';
  assert.equal(roundtrip(code), code);
});
test('code containing triple backticks gets a safe enclosing fence', () => {
  const code = '````md\n```\n````';
  assert.equal(roundtrip(code), code);
});
test('nested list content and ordered starting number survive', () => {
  const result = roundtrip('5. Parent\n   - Child\n     - Grandchild');
  assert.match(result, /^5\. Parent/);
  assert.match(result, /\n   - Child\n     - Grandchild/);
});
test('table alignment and literal cell pipes survive', () => {
  const result = roundtrip('| a | b |\n| :--- | ---: |\n| a\\|b | c |');
  assert.match(result, /\| :--- \| ---: \|/);
  assert.match(result, /a\\\|b/);
});
test('literal visual punctuation remains literal after reopening', () => {
  const root = dom.window.document.createElement('div');
  root.innerHTML = '<p></p>';
  root.firstChild.textContent = '**literal** [brackets]';
  const result = editor.editorElementToMarkdown(root);
  const reopened = dom.window.document.createElement('div');
  reopened.innerHTML = editor.markdownToEditorHtml(result);
  assert.equal(reopened.textContent.trim(), '**literal** [brackets]');
  assert.equal(reopened.querySelector('strong'), null);
});
test('appended blocks are separated after a single newline', () => {
  assert.equal(editor.appendMarkdownBlock('first\n', 'second'), 'first\n\nsecond');
});

test('images and inline code remain content after serialization', () => {
  const image = roundtrip('Before ![](image.png) after');
  assert.match(editor.markdownToEditorHtml(image), /<img src="image.png" alt=""/);
  const code = roundtrip('A `a*b` example');
  assert.match(editor.markdownToEditorHtml(code), /<code>a\*b<\/code>/);
});
test('blockquote paragraphs and hard breaks retain their structure', () => {
  assert.match(roundtrip('> first\n>\n> second'), /> first\n>\n> second/);
  assert.match(editor.markdownToEditorHtml(roundtrip('first  \nsecond')), /<br>/);
});

test('loose list paragraphs and code blocks keep their structure', () => {
 const input = '1. First\n\n   Second paragraph\n\n   ```js\n   const a = 1;\n   ```\n\n2. Next';
 const html = editor.markdownToEditorHtml(roundtrip(input));
 const root = dom.window.document.createElement('div'); root.innerHTML = html;
 assert.equal(root.querySelectorAll('li').length,2);
 assert.equal(root.querySelectorAll('li p').length,3);
 assert.equal(root.querySelector('li pre code').textContent.trim(),'const a = 1;');
});
test('literal paragraph markers do not turn into blocks', () => {
 for (const text of ['# Heading','- item','1. item','~~literal~~','---','===']) {
  const root = dom.window.document.createElement('div');root.innerHTML='<p></p>';root.firstChild.textContent=text;
  const reopened = dom.window.document.createElement('div');reopened.innerHTML=editor.markdownToEditorHtml(editor.editorElementToMarkdown(root));
  assert.equal(reopened.children[0].tagName,'P');assert.equal(reopened.textContent.trim(),text);assert.equal(reopened.querySelector('s'),null);
 }
});

test('long code with many backtick runs does not exceed argument limits',()=>{
 const root=dom.window.document.createElement('div'),pre=dom.window.document.createElement('pre');
 pre.textContent='` '.repeat(150000)+'\n';root.appendChild(pre);
 const markdown=editor.editorElementToMarkdown(root);assert.ok(markdown.startsWith('```\n'));assert.ok(markdown.length>300000);
});

test('link destinations with unmatched parentheses survive visual editing', () => {
 const input = '[link](<https://example.com/a)b(c>)';
 const root = dom.window.document.createElement('div');
 root.innerHTML = editor.markdownToEditorHtml(roundtrip(input));
 assert.equal(root.querySelector('a')?.getAttribute('href'), 'https://example.com/a)b(c');
 assert.equal(root.textContent.trim(), 'link');
});

test('image descriptions retain literal Markdown and line breaks stay inline', () => {
 const root = dom.window.document.createElement('div');
 const p = dom.window.document.createElement('p');
 const img = dom.window.document.createElement('img');
 img.setAttribute('src', 'image.png'); img.setAttribute('alt', '*literal*\nnext');
 p.appendChild(img); root.appendChild(p);
 const reopened = dom.window.document.createElement('div');
 reopened.innerHTML = editor.markdownToEditorHtml(editor.editorElementToMarkdown(root));
 assert.equal(reopened.querySelector('img')?.getAttribute('alt'), '*literal* next');
});

test('link and image titles survive a visual roundtrip', () => {
 const root = dom.window.document.createElement('div');
 root.innerHTML = editor.markdownToEditorHtml(roundtrip('[Link](https://example.com "A title") ![Image](image.png "Caption")'));
 assert.equal(root.querySelector('a').title, 'A title');
 assert.equal(root.querySelector('img').title, 'Caption');
});
