const assert = require("node:assert/strict");
const editor = require("../dist/index.js");

assert.deepEqual(editor.countDocument("one two\nthree"), {
  words: 3,
  characters: 13,
});
assert.equal(editor.appendMarkdownBlock("# Note", "**Result:** 42"), "# Note\n\n**Result:** 42");
assert.match(editor.markdownToEditorHtml("# Title\n\n- [x] Done"), /<h1>Title<\/h1>/);
assert.match(editor.markdownToEditorHtml("# Title\n\n- [x] Done"), /data-task="checked"/);

console.log("document-editor smoke tests passed");
