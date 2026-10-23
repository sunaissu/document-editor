const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>');
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

function withEditor(initial, run) {
  const root = createRoot(document.getElementById('root'));
  let content = initial;
  const render = () => root.render(React.createElement(RichTextEditor, {
    content,
    onChange(next) { content = next; render(); },
  }));
  try {
    act(render);
    const editor = document.querySelector('[contenteditable]');
    run({
      editor,
      readContent: () => content,
      update(next) { act(() => { content = next; render(); }); },
      caret(node, offset) {
        act(() => editor.focus());
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      },
      readCaret() {
        const selection = window.getSelection();
        return { node: selection.anchorNode, offset: selection.anchorOffset };
      },
    });
  } finally {
    act(() => root.unmount());
  }
}

test('remote changes on both sides of a visual caret preserve its unchanged local text position', () => {
  withEditor('Alice first\n\nBob middle\n\nAlice last', ({ editor, caret, update, readCaret }) => {
    caret(editor.querySelectorAll('p')[1].firstChild, 3);
    update('PREFIX Alice first\n\nBob middle\n\nAlice last SUFFIX');
    const current = readCaret();
    assert.equal(current.node, editor.querySelectorAll('p')[1].firstChild,
      `Caret moved into ${JSON.stringify(current.node.textContent)} at ${current.offset}`);
    assert.equal(current.offset, 3);
  });
});

test('a visual caret at the start of a paragraph stays in that paragraph after a remote edit', () => {
  withEditor('Alice first\n\nBob middle', ({ editor, caret, update, readCaret }) => {
    caret(editor.querySelectorAll('p')[1].firstChild, 0);
    update('Alice first!\n\nBob middle');
    const current = readCaret();
    assert.equal(current.node, editor.querySelectorAll('p')[1].firstChild,
      `Caret moved into ${JSON.stringify(current.node.textContent)} at ${current.offset}`);
    assert.equal(current.offset, 0);
  });
});

test('a remote update keeps the caret in a locally created trailing empty paragraph', () => {
  withEditor('Alice first', ({ editor, caret, update, readCaret }) => {
    const empty = document.createElement('p');
    empty.appendChild(document.createElement('br'));
    editor.appendChild(empty);
    caret(empty, 0);
    act(() => editor.dispatchEvent(new dom.window.InputEvent('input', {
      bubbles: true, inputType: 'insertParagraph',
    })));
    update('Alice first!');
    const current = readCaret();
    const paragraphs = editor.querySelectorAll('p');
    assert.equal(paragraphs.length, 2);
    assert.equal(current.node === paragraphs[1] || paragraphs[1].contains(current.node), true);
    assert.equal(current.offset, 0);
    update('Alice first!!');
    assert.equal(editor.querySelectorAll('p').length, 2);
    const next = readCaret();
    assert.equal(next.node === editor.lastElementChild || editor.lastElementChild.contains(next.node), true);
  });
});

test('identical paragraphs retain their order when surrounding peers edit', () => {
  withEditor('same text\n\nsame text\n\nsame text', ({ editor, caret, update, readCaret }) => {
    caret(editor.querySelectorAll('p')[1].firstChild, 5);
    update('FIRST same text\n\nsame text\n\nsame text LAST');
    const current = readCaret();
    assert.equal(current.node, editor.querySelectorAll('p')[1].firstChild);
    assert.equal(current.offset, 5);
  });
});

test('backward selections retain direction and selected text through separate remote edits', () => {
  withEditor('Alice first\n\nBob middle\n\nAlice last', ({ editor, caret, update }) => {
    const middle = editor.querySelectorAll('p')[1].firstChild;
    caret(middle, 8);
    window.getSelection().setBaseAndExtent(middle, 8, middle, 4);
    update('PREFIX Alice first\n\nBob middle\n\nAlice last SUFFIX');
    const selection = window.getSelection();
    assert.equal(selection.toString(), 'midd');
    assert.equal(selection.anchorOffset, 8);
    assert.equal(selection.focusOffset, 4);
    assert.equal(selection.anchorNode, editor.querySelectorAll('p')[1].firstChild);
  });
});

test('an empty paragraph between existing paragraphs survives repeated remote changes', () => {
  withEditor('Alice first\n\nAlice last', ({ editor, caret, update, readCaret }) => {
    const empty = document.createElement('p');
    empty.appendChild(document.createElement('br'));
    editor.insertBefore(empty, editor.querySelectorAll('p')[1]);
    caret(empty, 0);
    update('PREFIX Alice first\n\nAlice last SUFFIX');
    update('PREFIX Alice first!\n\nAlice last SUFFIX!');
    const paragraphs = editor.querySelectorAll('p');
    assert.equal(paragraphs.length, 3);
    assert.equal(paragraphs[1].textContent, '');
    assert.equal(readCaret().node, paragraphs[1]);
    assert.equal(readCaret().offset, 0);
  });
});

test('a caret at a paragraph end stays there when a different paragraph changes', () => {
  withEditor('Bob first\n\nAlice last', ({ editor, caret, update, readCaret }) => {
    caret(editor.querySelectorAll('p')[0].firstChild, 9);
    update('Bob first\n\nAlice last extra');
    const current = readCaret();
    assert.equal(current.node, editor.querySelectorAll('p')[0].firstChild);
    assert.equal(current.offset, 9);
  });
});

test('an existing empty heading is not cloned as a local draft', () => {
  withEditor('#\n\nAlice last', ({ editor, caret, update, readCaret }) => {
    caret(editor.querySelector('h1'), 0);
    update('#\n\nAlice last extra');
    assert.equal(editor.querySelectorAll('h1').length, 1);
    assert.equal(readCaret().node, editor.querySelector('h1'));
    assert.equal(readCaret().offset, 0);
  });
});

test('a locally empty paragraph in a list item keeps its list parent', () => {
  withEditor('- Alice first\n- Bob last', ({ editor, caret, update, readCaret }) => {
    const first = editor.querySelector('li');
    const empty = document.createElement('p');
    empty.appendChild(document.createElement('br'));
    first.appendChild(empty);
    caret(empty, 0);
    update('- Alice first!\n- Bob last');
    const restored = editor.querySelector('li p');
    assert.ok(restored);
    assert.equal(readCaret().node, restored);
    assert.equal(restored.parentElement, editor.querySelector('li'));
  });
});

test('a locally typed trailing space survives a peer update before the next word', () => {
  withEditor('Alice first\n\nBob', ({ editor, caret, update, readCaret, readContent }) => {
    const bob = editor.querySelectorAll('p')[1].firstChild;
    bob.textContent = 'Bob ';
    caret(bob, 4);
    act(() => editor.dispatchEvent(new dom.window.InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: ' ',
    })));
    update('Alice first!\n\nBob');
    const current = readCaret();
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob ');
    assert.equal(current.node, editor.querySelectorAll('p')[1].firstChild);
    assert.equal(current.offset, 4);
    act(() => {
      const range = window.getSelection().getRangeAt(0);
      range.insertNode(document.createTextNode('continues'));
      range.collapse(false);
      editor.dispatchEvent(new dom.window.InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: 'continues',
      }));
    });
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob continues');
    assert.equal(readContent(), 'Alice first!\n\nBob continues');
  });
});

test('pending whitespace remains local through repeated peer appends at the same boundary', () => {
  withEditor('Bob', ({ editor, caret, update, readCaret }) => {
    const text = editor.querySelector('p').firstChild;
    text.textContent = 'Bob   ';
    caret(text, 5);
    act(() => editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true })));
    for (const suffix of ['X', 'XY', 'XYZ']) {
      update('Bob' + suffix);
      assert.equal(editor.querySelector('p').textContent, 'Bob   ' + suffix);
      assert.equal(readCaret().offset, 5);
    }
  });
});

test('equivalent peer whitespace is not duplicated and committed space deletion stays deleted', () => {
  withEditor('Bob', ({ editor, caret, update }) => {
    const text = editor.querySelector('p').firstChild;
    text.textContent = 'Bob  ';
    caret(text, 5);
    act(() => editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true })));
    update('Bob X');
    assert.equal(editor.querySelector('p').textContent, 'Bob  X');
    update('Bob XY');
    assert.equal(editor.querySelector('p').textContent, 'Bob  XY');
  });
  withEditor('Bob X', ({ editor, caret, update }) => {
    caret(editor.querySelector('p').firstChild, 4);
    update('BobX');
    assert.equal(editor.querySelector('p').textContent, 'BobX');
  });
});

test('partly committed repeated spaces survive an unrelated peer edit without reviving deleted committed spaces', () => {
  withEditor('Alice\n\nBob', ({ editor, caret, update, readCaret }) => {
    const text = editor.querySelectorAll('p')[1].firstChild;
    text.textContent = 'Bob  ';
    caret(text, 5);
    act(() => editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true })));
    update('Alice\n\nBob X');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob  X');
    assert.equal(readCaret().offset, 5);
    update('Alice!\n\nBob XY');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob  XY');
    assert.equal(readCaret().offset, 5);
    update('Alice!!\n\nBobXYZ');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob XYZ');
    assert.equal(readCaret().offset, 4);
    update('Alice!!!\n\nBobXYZ!');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob XYZ!');
    assert.equal(readCaret().offset, 4);
  });
});

test('partly committed mixed spaces retain pending tabs and nonbreaking spaces exactly', () => {
  withEditor('Alice\n\nBob', ({ editor, caret, update }) => {
    const text = editor.querySelectorAll('p')[1].firstChild;
    text.textContent = 'Bob \u00a0\t';
    caret(text, 6);
    act(() => editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true })));
    update('Alice\n\nBob X');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob \u00a0\tX');
    update('Alice!\n\nBob XY');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob \u00a0\tXY');
    update('Alice!!\n\nBobXYZ');
    assert.equal(editor.querySelectorAll('p')[1].textContent, 'Bob\u00a0\tXYZ');
  });
});
