const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const Y = require('yjs');
const editFile = require('node:path').resolve(__dirname, '../src/textEdit.ts');
const editModule = new Module(editFile, module); editModule.paths = module.paths;
editModule._compile(ts.transpileModule(fs.readFileSync(editFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, editFile);
const file = require('node:path').resolve(__dirname, '../src/yjsText.ts');
const compiled = new Module(file, module); compiled.paths = module.paths;
const originalRequire = compiled.require.bind(compiled);
compiled.require = id => id === './textEdit' ? editModule.exports : originalRequire(id);
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { applyTextEdit, trackText } = compiled.exports;
function setup(value) { const doc = new Y.Doc(); const text = doc.getText('text'); text.insert(0, value); trackText(text); return { doc, text }; }
test('stale input keeps a peer prefix and applies a local suffix', () => { const { doc, text } = setup('abc'); text.insert(0, 'X'); doc.transact(() => applyTextEdit(text, 'abc', 'abcd')); assert.equal(text.toString(), 'Xabcd'); doc.destroy(); });
test('local deletion preserves a peer insertion inside the selected range', () => { const { doc, text } = setup('abcd'); text.insert(2, 'PEER'); doc.transact(() => applyTextEdit(text, 'abcd', 'ad')); assert.equal(text.toString(), 'aPEERd'); doc.destroy(); });
test('several remote changes are rebased independently', () => { const { doc, text } = setup('abcd'); text.insert(0, 'X'); text.insert(3, 'Y'); doc.transact(() => applyTextEdit(text, 'abcd', 'ad')); assert.equal(text.toString(), 'XaYd'); doc.destroy(); });
test('two disconnected text replicas merge concurrent typing', () => { const a = setup('hello'); const b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc)); const bt = b.getText('text'); trackText(bt); a.doc.transact(() => applyTextEdit(a.text, 'hello', 'hello A')); b.transact(() => applyTextEdit(bt, 'hello', 'hello B')); const au = Y.encodeStateAsUpdate(a.doc), bu = Y.encodeStateAsUpdate(b); Y.applyUpdate(a.doc, bu); Y.applyUpdate(b, au); assert.equal(a.text.toString(), bt.toString()); assert.match(a.text.toString(), /A/); assert.match(a.text.toString(), /B/); a.doc.destroy(); b.destroy(); });

function mergeIndependentEdits(base, first, second) {
    const a = setup(base);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a.doc));
    const bt = b.getText('text');
    trackText(bt);
    try {
        a.doc.transact(() => applyTextEdit(a.text, base, first));
        b.transact(() => applyTextEdit(bt, base, second));
        const au = Y.encodeStateAsUpdate(a.doc), bu = Y.encodeStateAsUpdate(b);
        Y.applyUpdate(a.doc, bu);
        Y.applyUpdate(b, au);
        assert.equal(a.text.toString(), bt.toString());
        return a.text.toString();
    } finally {
        a.doc.destroy(); b.destroy();
    }
}

test('disjoint replacements preserve a concurrent insertion in the unchanged middle', () => {
    assert.equal(
        mergeIndependentEdits('aaa middle zzz', 'AAA middle ZZZ', 'aaa middle b zzz'),
        'AAA middle b ZZZ',
    );
});

test('escaping Markdown in separate paragraphs preserves concurrent text without duplicating paragraphs', () => {
    assert.equal(
        mergeIndependentEdits(
            'ALPHA_STABLE\n\nBETA_STABLE',
            'ALPHA\\_STABLE A\n\nBETA\\_STABLE',
            'ALPHA_STABLE\n\nBETA_STABLE B',
        ),
        'ALPHA\\_STABLE A\n\nBETA\\_STABLE B',
    );
});

test('separate stale local replacements retain peer edits between and inside them', () => {
    const { doc, text } = setup('aaa middle zzz');
    text.insert(1, 'ONE');
    text.insert(text.toString().indexOf('middle') + 3, 'TWO');
    text.insert(text.length - 1, 'THREE');
    doc.transact(() => applyTextEdit(text, 'aaa middle zzz', 'AAA middle ZZZ'));
    assert.equal(text.toString(), 'AAAONE midTWOdle ZZZTHREE');
    doc.destroy();
});

test('rebasing beyond the journal keeps separate remote changes around the local insertion', () => {
    const base = 'aaa middle zzz';
    const { doc, text } = setup(base);
    doc.transact(() => applyTextEdit(text, base, 'AAA middle ZZZ'));
    for (let i = 0; i < 33; i++) text.insert(text.length, '!');
    doc.transact(() => applyTextEdit(text, base, 'aaa midBdle zzz'));
    assert.equal(text.toString(), 'AAA midBdle ZZZ' + '!'.repeat(33));
    doc.destroy();
});
