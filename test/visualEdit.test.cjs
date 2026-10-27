const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div><div id="peer"></div>');
Object.assign(global, {
  window: dom.window, document: dom.window.document, Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter, HTMLElement: dom.window.HTMLElement,
  requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { RichTextEditor } = require('../dist/index.js');

function edit(initial, html) {
  const root = createRoot(document.getElementById('root'));
  let content = initial;
  const changes = [];
  const render = () => root.render(React.createElement(RichTextEditor, {
    content,
    onChange(next, previous) { changes.push([previous, next]); content = next; render(); },
  }));
  try {
    act(render);
    const editor = document.querySelector('#root [contenteditable]');
    act(() => {
      editor.innerHTML = html;
      editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    return { content, changes };
  } finally {
    act(() => root.unmount());
  }
}

test('typing preserves untouched literal underscore and hyphen source spellings', () => {
  const initial = 'ALICE_LINE - Alice is typing\n\nBOB_LINE - Bob is typing';
  const result = edit(initial, '<p>ALICE_LINE - Alice is typing A</p><p>BOB_LINE - Bob is typing</p>');
  assert.equal(result.content, 'ALICE_LINE - Alice is typing A\n\nBOB_LINE - Bob is typing');
  assert.equal(result.changes[0][0], initial);
});

test('a DOM normalization without a user change emits the original source', () => {
  assert.equal(edit('*word* and SOME_LABEL', '<p><em>word</em> and SOME_LABEL</p>').content, '*word* and SOME_LABEL');
});

test('removing italic and bold aliases deletes their original source markers', () => {
  assert.equal(edit('*word*', '<p>word</p>').content, 'word');
  assert.equal(edit('__word__', '<p>word</p>').content, 'word');
});

test('format conversion and text edits inside alias markers preserve intended formatting', () => {
  assert.equal(edit('__word__', '<p><em>word</em></p>').content, '_word_');
  assert.equal(edit('*word*', '<p><strong>word</strong></p>').content, '**word**');
  assert.equal(edit('~~word~~', '<p><strong>word</strong></p>').content, '**word**');
  assert.equal(edit('*word*', '<p><em>wordX</em></p>').content, '*wordX*');
  assert.equal(edit('*word*', '<p><em>wor</em></p>').content, '*wor*');
});

test('inserting a paragraph and punctuation retains untouched source outside the edit', () => {
  assert.equal(edit('ALICE_LINE', '<p>ALICE_LINE</p><p>new_line - text</p>').content,
    'ALICE_LINE\n\nnew\\_line \\- text');
});

test('two replicas typing into initially unescaped labels merge only their actual keystrokes', () => {
  const Y = require('yjs');
  const { useYjsDocument } = require('../dist/yjs.js');
  const first = new Y.Doc(), second = new Y.Doc();
  first.getText('document-content').insert(0, 'ALICE_LINE\n\nBOB_LINE');
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
  const roots = [createRoot(document.getElementById('root')), createRoot(document.getElementById('peer'))];
  function App({ document }) {
    const binding = useYjsDocument(document);
    return React.createElement(RichTextEditor, { content: binding.value, onChange: binding.onChange });
  }
  try {
    act(() => {
      roots[0].render(React.createElement(App, { document: first }));
      roots[1].render(React.createElement(App, { document: second }));
    });
    const a = document.querySelector('#root [contenteditable]'), b = document.querySelector('#peer [contenteditable]');
    act(() => {
      a.querySelectorAll('p')[0].appendChild(document.createTextNode(' A'));
      a.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
      b.querySelectorAll('p')[1].appendChild(document.createTextNode(' B'));
      b.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    });
    const updateA = Y.encodeStateAsUpdate(first), updateB = Y.encodeStateAsUpdate(second);
    act(() => { Y.applyUpdate(first, updateB); Y.applyUpdate(second, updateA); });
    assert.equal(first.getText('document-content').toString(), 'ALICE_LINE A\n\nBOB_LINE B');
    assert.equal(second.getText('document-content').toString(), first.getText('document-content').toString());
    assert.deepEqual([...a.querySelectorAll('p')].map(p => p.textContent), ['ALICE_LINE A', 'BOB_LINE B']);
    assert.deepEqual([...b.querySelectorAll('p')].map(p => p.textContent), ['ALICE_LINE A', 'BOB_LINE B']);
  } finally {
    act(() => roots.forEach(root => root.unmount()));
    first.destroy(); second.destroy();
  }
});
