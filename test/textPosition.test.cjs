const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const file = require('node:path').resolve(__dirname, '../src/textEdit.ts');
const compiled = new Module(file, module);
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, file);
const { sequenceChanges, moveSequencePosition, moveTextPosition } = compiled.exports;

function verify(before, after) {
  const changes = sequenceChanges(before, after);
  let old = 0, next = 0, result = [];
  for (const change of changes) {
    assert.ok(change.start >= old && change.end >= change.start && change.end <= before.length);
    assert.ok(change.nextStart >= next && change.nextEnd >= change.nextStart && change.nextEnd <= after.length);
    assert.deepEqual(Array.from(before.slice(old, change.start)), Array.from(after.slice(next, change.nextStart)));
    result.push(...before.slice(old, change.start), ...after.slice(change.nextStart, change.nextEnd));
    old = change.end;
    next = change.nextEnd;
  }
  assert.deepEqual(Array.from(before.slice(old)), Array.from(after.slice(next)));
  result.push(...before.slice(old));
  assert.deepEqual(result, Array.from(after));
  for (let position = 0; position <= before.length; position++) {
    const mapped = moveSequencePosition(position, changes);
    assert.ok(mapped >= 0 && mapped <= after.length);
  }
  return changes;
}

test('caret mapping keeps unchanged islands between edits and explicit insertion affinity', () => {
  assert.equal(moveTextPosition(5, 'abc LOCAL xyz', 'PREFIX abc LOCAL xyz SUFFIX'), 12);
  assert.equal(moveTextPosition(3, 'abcdef', 'abcNEWdef', 'before'), 3);
  assert.equal(moveTextPosition(3, 'abcdef', 'abcNEWdef', 'after'), 6);
  assert.equal(moveTextPosition(5, 'abcdefgh', 'abcgh'), 3);
});

test('sequence diff reconstructs randomized repeated strings and structural token arrays', () => {
  let seed = 917;
  const random = maximum => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 0x100000000 * maximum);
  };
  const alphabet = ['a', 'a', 'b', ' ', '\n', '<P>', '</P>', '<BR>'];
  for (let run = 0; run < 1500; run++) {
    const before = Array.from({ length: random(60) }, () => alphabet[random(alphabet.length)]);
    const after = Array.from({ length: random(60) }, () => alphabet[random(alphabet.length)]);
    verify(before, after);
    verify(before.join(''), after.join(''));
  }
});

test('large unrelated replacements return a bounded complete edit', () => {
  const before = 'a'.repeat(25000), after = 'b'.repeat(30000);
  const changes = verify(before, after);
  assert.deepEqual(changes, [{ start: 0, end: 25000, nextStart: 0, nextEnd: 30000 }]);
});
