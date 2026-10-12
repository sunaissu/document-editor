const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const Y = require('yjs');
const file = require('node:path').resolve(__dirname, '../src/yjsText.ts');
const compiled = new Module(file, module); compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { applyTextEdit, trackText } = compiled.exports;
function setup(value) { const doc = new Y.Doc(); const text = doc.getText('text'); text.insert(0, value); trackText(text); return { doc, text }; }
test('stale input keeps a peer prefix and applies a local suffix', () => { const { doc, text } = setup('abc'); text.insert(0, 'X'); doc.transact(() => applyTextEdit(text, 'abc', 'abcd')); assert.equal(text.toString(), 'Xabcd'); doc.destroy(); });
test('local deletion preserves a peer insertion inside the selected range', () => { const { doc, text } = setup('abcd'); text.insert(2, 'PEER'); doc.transact(() => applyTextEdit(text, 'abcd', 'ad')); assert.equal(text.toString(), 'aPEERd'); doc.destroy(); });
test('several remote changes are rebased independently', () => { const { doc, text } = setup('abcd'); text.insert(0, 'X'); text.insert(3, 'Y'); doc.transact(() => applyTextEdit(text, 'abcd', 'ad')); assert.equal(text.toString(), 'XaYd'); doc.destroy(); });
test('two disconnected text replicas merge concurrent typing', () => { const a = setup('hello'); const b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc)); const bt = b.getText('text'); trackText(bt); a.doc.transact(() => applyTextEdit(a.text, 'hello', 'hello A')); b.transact(() => applyTextEdit(bt, 'hello', 'hello B')); const au = Y.encodeStateAsUpdate(a.doc), bu = Y.encodeStateAsUpdate(b); Y.applyUpdate(a.doc, bu); Y.applyUpdate(b, au); assert.equal(a.text.toString(), bt.toString()); assert.match(a.text.toString(), /A/); assert.match(a.text.toString(), /B/); a.doc.destroy(); b.destroy(); });
