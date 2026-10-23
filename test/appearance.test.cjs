const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { DocumentEditor, getDocumentEditorScrollbarProps } = require('../dist/index.js');

test('scrollbar props distinguish native reset, custom colors, thin width and hidden scrolling', () => {
  const native = getDocumentEditorScrollbarProps({ thumbColor: ' ', trackColor: '' });
  assert.equal(native['data-document-editor-scrollbar'], 'native');
  assert.equal(native.style['--document-scrollbar-color'], 'auto');
  assert.equal(native.style['--document-scrollbar-width'], 'auto');
  const trackOnly = getDocumentEditorScrollbarProps({ trackColor: ' #123456 ' });
  assert.equal(trackOnly['data-document-editor-scrollbar'], 'custom');
  assert.equal(trackOnly.style['--document-scrollbar-color'], 'currentColor #123456');
  assert.equal(getDocumentEditorScrollbarProps({ thumbColor: '#345678' }).style['--document-scrollbar-track'], 'transparent');
  assert.equal(getDocumentEditorScrollbarProps({ width: 'thin' }).style['--document-scrollbar-size'], '8px');
  assert.equal(getDocumentEditorScrollbarProps({ width: 'thin' })['data-document-editor-scrollbar'], 'native');
  assert.equal(getDocumentEditorScrollbarProps({ width: 'none', thumbColor: '#345678' })['data-document-editor-scrollbar'], 'hidden');
});

test('editor keeps theme overrides and caller styles when scrollbar customization is applied', () => {
  const render = props => new JSDOM(renderToStaticMarkup(React.createElement(DocumentEditor, {
    value: '# Saved draft', onChange() {}, defaultMode: 'markdown', ...props,
  }))).window.document.querySelector('.sunaissu-document-editor');
  const editor = render({
    theme: 'dark', brandColors: { primary: '#9333ea', secondary: '#db2777' },
    themeOverrides: { background: '#102030' },
    scrollbar: { thumbColor: '#abcdef', width: 'thin' },
    style: { '--document-scrollbar-track': '#203040' },
  });
  assert.equal(editor.dataset.theme, 'dark');
  assert.equal(editor.dataset.documentEditorScrollbar, 'custom');
  assert.equal(editor.style.getPropertyValue('--document-accent'), '#9333ea');
  assert.equal(editor.style.getPropertyValue('--document-success'), '#db2777');
  assert.equal(editor.style.getPropertyValue('--document-bg'), '#102030');
  assert.equal(editor.style.getPropertyValue('--document-scrollbar-track'), '#203040');
  assert.equal(editor.querySelector('textarea').value, '# Saved draft');
  const reset = render({ theme: 'light' });
  assert.equal(reset.dataset.documentEditorScrollbar, 'native');
  assert.equal(reset.style.getPropertyValue('--document-scrollbar-color'), 'auto');
  assert.equal(reset.style.getPropertyValue('--document-scrollbar-width'), 'auto');
});
