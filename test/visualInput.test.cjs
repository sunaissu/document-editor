const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>');
Object.assign(global, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { RichTextEditor } = require('../dist/index.js');

test('visual input survives host rerenders and keeps the correct edit base', () => {
 const root = createRoot(document.getElementById('root'));
 let content = 'Before', revision = 0;
 const edits = [];
 const render = () => root.render(React.createElement(RichTextEditor, {
  content, className: 'revision-' + revision,
  onChange(next, previous) { edits.push([previous, next]); content = next; render(); },
 }));
 try {
  act(render);
  const editor = document.querySelector('[contenteditable]');
  act(() => { editor.innerHTML = '<p>After</p>'; editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText' })); });
  assert.equal(editor.textContent, 'After');
  assert.deepEqual(edits, [['Before', 'After']]);
  act(() => { revision++; render(); });
  assert.equal(editor.textContent, 'After');
  act(() => { content = 'Remote'; render(); });
  assert.equal(editor.textContent.trimEnd(), 'Remote');
  act(() => { editor.innerHTML = '<p>Replacement</p>'; editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true })); });
  assert.deepEqual(edits[1], ['Remote', 'Replacement']);
  assert.equal(editor.textContent, 'Replacement');
 } finally { act(() => root.unmount()); dom.window.close(); }
});
