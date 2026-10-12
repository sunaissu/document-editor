const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = require('node:path');
const cache = new Map();
function load(name) {
 const file=path.resolve(__dirname,'../src/'+name);
 if(cache.has(file)) return cache.get(file).exports;
 const compiled=new Module(file,module); compiled.paths=module.paths; cache.set(file,compiled);
 const ordinary=compiled.require.bind(compiled);
 compiled.require=id=>id.startsWith('./') ? load(id.slice(2)+'.ts') : ordinary(id);
 compiled._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
 return compiled.exports;
}
const {validateDocumentImageFile: validate, uploadedImageMarkdown: markdown}=load('imageUpload.tsx');
const {parseDocumentMarkdown: parse}=load('parser.ts');
test('image admission rejects unsupported, empty and oversized uploads', () => {
 validate({type:'image/png',size:100});
 for(const file of [{type:'image/svg+xml',size:10},{type:'image/png',size:0},{type:'image/jpeg',size:6*1024*1024}]) assert.throws(()=>validate(file));
});
test('uploaded image metadata remains literal and rejects unsafe destinations', () => {
 const html=parse(markdown({url:'https://example.com/a)b.png',alt:'*literal*',caption:'# not a heading'}));
 assert.match(html,/alt="\*literal\*"/); assert.doesNotMatch(html,/<h1/);
 assert.match(html,/https:\/\/example.com\/a\)b.png/);
 for(const url of ['javascript:alert(1)','data:image/svg+xml;base64,AAAA','mailto:x@y.test']) assert.throws(()=>markdown({url}),/unsupported/);
 assert.match(markdown({url:'data:image/png;base64,AAAA'}),/data:image\/png/);
});
