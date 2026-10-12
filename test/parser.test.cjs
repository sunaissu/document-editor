const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const file = require('node:path').resolve(__dirname, '../src/parser.ts');
const compiled = new Module(file, module);
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file);
const { parseDocumentMarkdown: parse, safeDocumentLink } = compiled.exports;

test('nested lists, starting numbers, and emphasis retain structure', () => {
  assert.match(parse('5. parent\n   - **bold _italic_**\n   - child'), /<ol start="5">[\s\S]*<ul>[\s\S]*<strong>bold <em>italic<\/em><\/strong>/);
});
test('fences preserve internal whitespace and literal shorter fences', () => {
  const html = parse('~~~~js\na  \n\n\nb\n~~~\n~~~~');
  assert.match(html, /a  \n\n\nb\n~~~\n<\/code>/);
});
test('frontmatter needs a closing delimiter; horizontal rules stay rules', () => {
  assert.match(parse('---\nhello'), /<hr>[\s\S]*<p>hello<\/p>/);
  assert.match(parse('---\ntitle: example\n---\nhello'), /data-raw-block="frontmatter"/);
});
test('tables, tasks, relative links, and empty-alt images render', () => {
  assert.match(parse('| a | b |\n| :--- | ---: |\n| a\\|b | c |'), /text-align:right/);
  assert.match(parse('- [x] done'), /data-task="checked"/);
  assert.match(parse('[Guide](guide.md)'), /href="guide.md"/);
  assert.match(parse('Before ![](image.png) after'), /<img src="image.png" alt=""/);
});
test('untrusted HTML and URL schemes never become executable markup', () => {
  assert.doesNotMatch(parse('<script>alert(1)</script>'), /<script>/);
  assert.doesNotMatch(parse('[x](javascript:alert(1))'), /href="javascript:/);
  assert.equal(safeDocumentLink('javascript:alert(1)'), '#');
  assert.equal(safeDocumentLink('guide.md'), 'guide.md');
  assert.equal(safeDocumentLink('file:///private.txt'), '#');
  assert.equal(safeDocumentLink('data:image/png;base64,AA=='), '#');
  assert.doesNotMatch(parse('[x](file:///private.txt)'), /href="file:/);
});

test('search retains source offsets through Unicode case folding', () => {
 const {findDocumentMatches: find, getDocumentOutline: outline} = compiled.exports;
 assert.deepEqual(find('İ plan plans PLAN', 'plan', {wholeWord:true}), [2,13]);
 assert.deepEqual(find('a.b a?b', 'a.b'), [0]);
 assert.deepEqual(find('𐐀plan plan', 'plan', {wholeWord:true}), [7]);
 assert.deepEqual(outline('---\ntitle: # ignore\n---\n# First\n\n```\n# hidden\n```\n## Last').map(h=>h.text), ['First','Last']);
});

test('preview source ranges distinguish duplicate formatted headings and CRLF offsets', () => {
 const input = '---\r\ntitle: note\r\n---\r\n# **Same**\r\n\r\n# **Same**\r\n\r\nBody';
 const html = parse(input, true);
 const headings = [...html.matchAll(/<h1 data-source-start="(\d+)" data-source-end="(\d+)">/g)];
 assert.equal(headings.length, 2);
 assert.equal(Number(headings[0][1]), input.indexOf('# **Same**'));
 assert.equal(Number(headings[1][1]), input.lastIndexOf('# **Same**'));
 assert.match(html, new RegExp('data-source-start="'+input.indexOf('Body')+'"'));
 assert.doesNotMatch(parse('# Title'), /data-source-start/);
});

test('Markdown image destinations use the same policy as inserted images', () => {
 for (const url of ['mailto:x@y.test','tel:123','data:image/png;base64,A===']) {
  assert.doesNotMatch(parse('![description]('+url+')'), new RegExp('src="'+url.replace(/[.*+?^$()|[\]\\]/g,'\\$&')+'"'));
 }
 const {safeDocumentImage} = compiled.exports;
 for(const suffix of ['A','A===','AAAA====','!!!']) assert.equal(safeDocumentImage('data:image/png;base64,'+suffix),'#');
 assert.match(parse('![description](data:image/png;base64,AA==)'),/src="data:image\/png;base64,AA=="/);
});

test('large raster data URLs validate without recursive-regexp stack exhaustion', () => {
 const url='data:image/png;base64,'+'A'.repeat(7*1024*1024);
 assert.equal(compiled.exports.safeDocumentImage(url),url);
});
