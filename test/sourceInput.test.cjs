const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>');
const frames = [];
Object.assign(global, {
  window: dom.window, document: dom.window.document, Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement, DOMRect: dom.window.DOMRect,
  ResizeObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: callback => (frames.push(callback), frames.length),
  cancelAnimationFrame: () => {}, IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { DocumentEditor } = require('../dist/index.js');

function withEditor(initial, run) {
  const root = createRoot(document.getElementById('root'));
  const ref = React.createRef();
  const edits = [];
  let value = initial;
  const render = () => root.render(React.createElement(DocumentEditor, {
    ref, value, defaultMode: 'markdown', theme: 'light',
    onChange(next, previous) { edits.push([previous, next]); value = next; render(); },
  }));
  const flush = () => act(() => { while (frames.length) frames.shift()(); });
  try {
    act(render);
    flush();
    run({
      ref, source: document.querySelector('textarea'), getValue: () => value, edits, flush,
      click: label => act(() => document.querySelector('[aria-label="' + label + '"]').click()),
      clickText: text => act(() => [...document.querySelectorAll('button')].find(button => button.textContent === text).click()),
      type: (label, text) => act(() => {
        const input = [...document.querySelectorAll('.document-tool-content label')].find(node => node.textContent === label).querySelector('input');
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, text);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }),
      update: next => act(() => { value = next; render(); }),
    });
  } finally {
    act(() => root.unmount());
    frames.length = 0;
  }
}

test('formatting and imperative inserts use textarea offsets for CRLF documents', () => {
  withEditor('first\r\nsecond', ({ source, click, getValue, edits, flush }) => {
    source.setSelectionRange(6, 12);
    click('Bold');
    flush();
    assert.equal(getValue(), 'first\n**second**');
    assert.equal(source.value.slice(source.selectionStart, source.selectionEnd), 'second');
    assert.deepEqual(edits[0], ['first\r\nsecond', 'first\n**second**']);
    click('Undo');
    assert.equal(getValue(), 'first\r\nsecond');
    assert.equal(source.value, 'first\nsecond');
    click('Redo');
    assert.equal(getValue(), 'first\n**second**');
  });
  withEditor('first\r\nsecond', ({ source, ref, getValue }) => {
    source.setSelectionRange(6, 12);
    act(() => ref.current.insertText('replacement'));
    assert.equal(getValue(), 'first\nreplacement');
  });
});

test('CRLF composition keeps its original edit base while Yjs receives peer updates', () => {
  const Y = require('yjs');
  const { useYjsDocument } = require('../dist/yjs.js');
  const { Simulate } = require('react-dom/test-utils');
  const doc = new Y.Doc(), text = doc.getText('document-content');
  text.insert(0, 'first\r\nsecond');
  const root = createRoot(document.getElementById('root'));
  const ref = React.createRef(), edits = [];
  function App() {
    const binding = useYjsDocument(doc);
    return React.createElement(DocumentEditor, {
      ref, value: binding.value, history: binding.history, defaultMode: 'markdown', theme: 'light',
      onChange(next, previous) { edits.push([previous, next]); binding.onChange(next, previous); },
    });
  }
  try {
    act(() => root.render(React.createElement(App)));
    const source = document.querySelector('textarea');
    act(() => Simulate.compositionStart(source));
    source.value = 'first\nsecond語';
    act(() => Simulate.change(source));
    act(() => text.insert(0, 'PEER '));
    act(() => ref.current.insertText('blocked'));
    assert.equal(edits.length, 0);
    assert.equal(source.value, 'first\nsecond語');
    act(() => Simulate.compositionEnd(source));
    assert.deepEqual(edits[0], ['first\r\nsecond', 'first\nsecond語']);
    assert.equal(text.toString(), 'PEER first\nsecond語');
    assert.equal(source.value, 'PEER first\nsecond語');
    act(() => document.querySelector('[aria-label="Undo"]').click());
    assert.equal(text.toString(), 'PEER first\r\nsecond');
  } finally {
    act(() => root.unmount());
    frames.length = 0;
    doc.destroy();
  }
});

test('line formatting excludes the next line when selection ends at its start', () => {
  withEditor('first\nsecond', ({ source, click, getValue }) => {
    source.setSelectionRange(0, 6);
    click('Bullet list');
    assert.equal(getValue(), '- first\nsecond');
  });
});

test('outline navigation maps CRLF source ranges onto textarea selections', () => {
  withEditor('# First\r\n\r\n# Second', ({ source, click, flush }) => {
    click('Outline');
    act(() => document.querySelectorAll('.document-outline-list button')[1].click());
    flush();
    assert.equal(source.value.slice(source.selectionStart, source.selectionEnd), '# Second');
  });
});

test('remote CRLF updates preserve textarea caret offsets', () => {
  withEditor('first\r\nsecond', ({ source, update }) => {
    source.setSelectionRange(8, 8);
    update('Xfirst\r\nsecond');
    assert.equal(source.selectionStart, 9);
    assert.equal(source.selectionEnd, 9);
  });
});

test('replacement preview navigates exact CRLF matches without applying changes', () => {
  withEditor('first cat\r\nsecond cat', ({ source, click, clickText, type, getValue, flush }) => {
    click('Find & replace');
    type('Find', 'cat');
    type('Replace with', '<img src=x>');
    clickText('Review replace all');
    assert.equal(document.querySelectorAll('.document-replacement-preview img').length, 0);
    assert.equal(document.querySelector('.document-replacement-preview ins').textContent, '<img src=x>');
    clickText('Go to match 2');
    flush();
    assert.equal(source.value.slice(source.selectionStart, source.selectionEnd), 'cat');
    assert.equal(source.selectionStart, source.value.lastIndexOf('cat'));
    assert.equal(getValue(), 'first cat\r\nsecond cat');
  });
});

test('replace-all review invalidates after remote edits and applies with one undo', () => {
  withEditor('cat cat', ({ click, clickText, type, getValue, update }) => {
    click('Find & replace');
    type('Find', 'cat');
    type('Replace with', 'dog');
    clickText('Review replace all');
    update('cat cat remote');
    assert.equal(document.querySelector('.document-replace-confirm'), null);
    clickText('Review replace all');
    clickText('Apply');
    assert.equal(getValue(), 'dog dog remote');
    click('Undo');
    assert.equal(getValue(), 'cat cat remote');
  });
});
