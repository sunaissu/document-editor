const {test}=require('node:test');
const assert=require('node:assert/strict');
const {previewDocumentReplacement}=require('../dist/index.js');
test('replacement preview preserves exact source ranges and treats markup as literal text',()=>{
 const value='😀 first cat\r\nsecond cat.';
 const preview=previewDocumentReplacement(value,'cat','<img onerror=alert(1)>');
 assert.equal(preview.total,2);
 for(const entry of preview.entries){assert.equal(value.slice(entry.start,entry.end),'cat');assert.equal(entry.replacement,'<img onerror=alert(1)>');}
 assert.equal(preview.entries[1].before,value.slice(0,preview.entries[1].start));
});
test('replacement preview limits excerpts and respects search options and deletions',()=>{
 assert.equal(previewDocumentReplacement('Cat cat catch','cat','',{matchCase:true,wholeWord:true}).total,1);
 assert.equal(previewDocumentReplacement('cat','cat','').entries[0].replacement,'');
 const preview=previewDocumentReplacement('cat '.repeat(100),'cat','dog');
 assert.equal(preview.total,100);assert.equal(preview.entries.length,5);
 assert.deepEqual(previewDocumentReplacement('text','','other').entries,[]);
});
