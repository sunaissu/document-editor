const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const file=require('node:path').resolve(__dirname,'../src/table.ts'), compiled=new Module(file,module);compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText,file);
const {editTable}=compiled.exports;
const fixture=()=>{const doc=new JSDOM('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>One</td><td>Two</td></tr></tbody></table>').window.document;return {doc,table:doc.querySelector('table')};};
test('table row and column changes preserve surrounding content',()=>{
 const {table}=fixture();let cell=editTable(table.rows[1].cells[0],'row-below');assert.equal(table.rows.length,3);
 cell=editTable(cell,'column-after');assert.equal(table.rows[0].cells.length,3);assert.equal(table.rows[1].cells[2].textContent,'Two');
 cell=editTable(cell,'delete-column');assert.equal(table.rows[0].cells.length,2);
 editTable(cell,'delete-row');assert.equal(table.rows.length,2);assert.equal(table.rows[1].cells[0].textContent,'One');
});
test('header and final column remain valid',()=>{
 const {table}=fixture();editTable(table.rows[0].cells[0],'delete-row');assert.equal(table.rows.length,2);
 editTable(table.rows[1].cells[0],'delete-column');editTable(table.rows[1].cells[0],'delete-column');assert.equal(table.rows[0].cells.length,1);
 editTable(table.rows[0].cells[0],'row-above');assert.equal(table.rows[0].parentElement.tagName,'THEAD');assert.equal(table.rows[1].parentElement.tagName,'TBODY');
});
test('column alignment updates header and body; deleting a table leaves a writing position',()=>{
 const {doc,table}=fixture();editTable(table.rows[1].cells[1],'align-center');assert.ok(Array.from(table.rows).every(row=>row.cells[1].style.textAlign==='center'));
 const target=editTable(table.rows[0].cells[0],'delete-table');assert.equal(doc.querySelector('table'),null);assert.equal(target.tagName,'P');
});
test('table growth is bounded',()=>{
 const {table}=fixture();for(let i=0;i<220;i++)editTable(table.rows[1].cells[0],'row-below');assert.equal(table.rows.length,201);
 for(let i=0;i<60;i++)editTable(table.rows[1].cells[0],'column-after');assert.equal(table.rows[0].cells.length,50);
});
