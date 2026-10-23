const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript');
const file = require('node:path').resolve(__dirname, '../src/slashCommands.ts');
const compiled = new Module(file, module); compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText, file);
const { slashCommands, filterSlashCommands, getSourceSlash } = compiled.exports;
test('slash search covers headings, aliases, and templates without duplicate IDs', () => {
  assert.equal(new Set(slashCommands.map(command => command.id)).size, 31);
  assert.equal(filterSlashCommands('heading').length, 6);
  assert.equal(filterSlashCommands('h3')[0].id, 'h3');
  assert.equal(filterSlashCommands('bold')[0].markdown, '**Bold text**');
  assert.equal(filterSlashCommands('checkbox')[0].id, 'task');
  assert.equal(filterSlashCommands('meeting')[0].id, 'meeting');
  assert.deepEqual(filterSlashCommands('not-a-command'), []);
});
test('source slash commands require a whole line and preserve exact replacement offsets', () => {
  const value = 'Before.\n\n/heading 2\n\nAfter.';
  const end = value.indexOf('\n', 10);
  assert.deepEqual(getSourceSlash(value, end), {query:'heading 2', start:9, end});
  for (const input of ['https://example.com/path', 'text /table', '\\/table', '    /table', '/' + 'x'.repeat(41)]) assert.equal(getSourceSlash(input, input.length), null);
  assert.equal(getSourceSlash('/table rest', 6), null);
});
test('slash commands do not activate inside fenced code', () => {
  const ticks = String.fromCharCode(96).repeat(3);
  for (const fence of [ticks, '~~~']) {
    const inside = fence + 'js\n/table'; assert.equal(getSourceSlash(inside, inside.length), null);
    const outside = fence + 'js\nx\n' + fence + '\n/table'; assert.equal(getSourceSlash(outside, outside.length).query, 'table');
  }
});
