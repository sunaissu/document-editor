// Run a playground server, then: node qa/responsive-review.cjs
// Requires @playwright/test (or set PLAYWRIGHT_MODULE to its installed path).
// QA_BROWSER: chromium (default), webkit, or firefox. CHROME_PATH is optional.
// DOCUMENT_EDITOR_URL defaults to http://127.0.0.1:5174.
// QA_OUTPUT defaults to ignored qa/artifacts. QA_CASES optionally replaces the
// full light/dark matrix with JSON tuples such as [[390,844,"light"]].
const { chromium, firefox, webkit, expect } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.QA_OUTPUT || path.join(__dirname, 'artifacts');
const sizes = [[320,568],[568,320],[390,844],[844,390],[768,1024],[1024,768],[1440,900]];
const cases = process.env.QA_CASES ? JSON.parse(process.env.QA_CASES) : ['light','dark'].flatMap(theme=>sizes.map(([width,height])=>[width,height,theme]));
const reports = [], errors = [];
const engine = process.env.QA_BROWSER || 'chromium';
const sample = '# Project notes\n\nAlpha beta gamma.\n\n## Second heading\n\n' + 'Alpha paragraph for replacement.\n\n'.repeat(20);
(async () => {
  fs.mkdirSync(output,{recursive:true});
  const browser = await {chromium,firefox,webkit}[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    for (const [width,height,theme] of cases) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:width<1100,colorScheme:theme});
      const page = await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(process.env.DOCUMENT_EDITOR_URL || 'http://127.0.0.1:5174');
      const editor = page.locator('.sunaissu-document-editor'), toolbar=page.locator('.sunaissu-document-toolbar');
      const button = name=>toolbar.getByRole('button',{name,exact:true});
      const mode = name=>button(name).click();
      const source = page.getByLabel('Markdown source',{exact:true});
      const setSource = async value=>{await mode('Markdown');await source.fill(value);};
      const panel=page.locator('.document-tool-panel');
      const checkedControls=new Set();
      const inspect = async (state, all=false) => {
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width} ${state}: page overflow`);
        const targets = await editor.locator('button:visible, [role=checkbox]:visible, label:has(input[type=checkbox]):visible').evaluateAll(nodes=>nodes.map(el=>({name:el.getAttribute('aria-label')||el.textContent,rect:el.getBoundingClientRect().toJSON()})));
        if(width<1100)assert.deepEqual(targets.filter(({rect})=>rect.height<43.5||rect.width<43.5),[],`${state}: touch targets`);
        if(width<1100&&height<=500){const toolbarBox=await toolbar.boundingBox(),editorBox=await editor.boundingBox();assert.ok(toolbarBox.height<=(editorBox.width>=500?130:180),'short-screen toolbar leaves writing space');}
        if(all){const controls=editor.locator('button:visible:not(:disabled),input:visible:not([type=checkbox]),textarea:visible');for(let i=0;i<await controls.count();i++){const control=controls.nth(i);const key=await control.evaluate(el=>el.tagName+':'+(el.getAttribute('aria-label')||el.getAttribute('title')||(el.labels&&Array.from(el.labels).map(label=>label.textContent).join())||el.textContent));if(!checkedControls.has(key)){await control.click({trial:true});checkedControls.add(key);}}}
        if(state==='split'){
          const editorBounds=await editor.boundingBox(),writeBounds=await editor.locator('.sunaissu-document-write-pane').boundingBox(),previewBounds=await editor.locator('.sunaissu-document-preview-pane').boundingBox();
          const sideBySide=editorBounds.width>720||(height<=500&&editorBounds.width>=500);
          assert.ok(sideBySide?Math.abs(writeBounds.y-previewBounds.y)<2:previewBounds.y>=writeBounds.y+writeBounds.height-2,'split follows component width and available height');
          if(sideBySide)assert.ok(writeBounds.width>=245&&previewBounds.width>=245,'split panes retain useful width');
          await editor.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`split-${width}x${height}-${theme}.png`)});
        }
        reports.push({width,height,theme,state,controls:targets.length});
      };
      const bounded = async locator=>{
        const box=await locator.boundingBox();const bounds=await editor.boundingBox();assert.ok(box&&box.x>=bounds.x-1&&box.x+box.width<=bounds.x+bounds.width+1,'popup horizontal bounds');
        assert.ok(box.y>=Math.max(0,bounds.y)-1&&box.y+box.height<=Math.min(height,bounds.y+bounds.height)+1,'popup visible vertical bounds');
        const covered=await locator.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+Math.min(20,r.width/2),r.y+Math.min(20,r.height/2));return !el.contains(hit);});assert.equal(covered,false,'popup header is not covered');
      };
      await page.locator('.inspector').getByRole('button',{name:theme,exact:true}).click();await expect(editor).toHaveAttribute('data-theme',theme);
      const task=editor.getByRole('checkbox',{name:'Task complete',exact:true}).last();await task.click();await expect(task).toHaveAttribute('aria-checked','true');await task.press('Space');await expect(task).toHaveAttribute('aria-checked','false');
      await inspect('visual',true);
      await setSource(sample);
      for(const name of ['Markdown','Preview','Split','Visual']){await mode(name);await inspect(name.toLowerCase(),true);}
      for(const label of ['Bold','Italic','Strikethrough','Inline code','Bullet list','Numbered list','Task list','Quote','Code block','Divider','Equation','Heading 1','Heading 2','Heading 3','Heading 4','Heading 5','Heading 6']){
        await setSource('Alpha');await source.press('ControlOrMeta+a');await button(label).click();await expect(source).not.toHaveValue('Alpha');
      }
      await inspect('formatting-and-block-insertion');
      await setSource(sample);await mode('Visual');
      await button('Find & replace').click();await panel.getByLabel('Find',{exact:true}).fill('Alpha');await panel.getByLabel('Replace with',{exact:true}).fill('Changed');await panel.getByRole('button',{name:'Review replace all',exact:true}).click();await expect(panel.getByRole('region',{name:'Replacement preview'})).toBeVisible();await inspect('find-replacement-preview',true);await panel.getByRole('button',{name:'Apply',exact:true}).click();await page.getByRole('button',{name:'Close panel',exact:true}).click();
      await mode('Markdown');assert.ok((await source.inputValue()).includes('Changed'));await button('Undo').click();assert.ok((await source.inputValue()).includes('Alpha'));await button('Redo').click();assert.ok((await source.inputValue()).includes('Changed'));await inspect('undo-redo');
      await button('Outline').click();await panel.getByRole('button',{name:/Second heading/}).click();await inspect('outline-navigation');await page.getByRole('button',{name:'Close panel',exact:true}).click();
      await setSource('');await mode('Visual');await button('Table').click();await panel.getByLabel('Rows',{exact:true}).fill('3');await panel.getByLabel('Columns',{exact:true}).fill('3');await inspect('table-insertion',true);await panel.getByRole('button',{name:'Insert table',exact:true}).click();await expect(editor.locator('.sunaissu-rich-text-editor table')).toBeVisible();
      await editor.locator('td').first().click();await expect(button('Row above')).toBeVisible();await inspect('table-context-toolbar',true);const initialRows=await editor.locator('.sunaissu-rich-text-editor tr').count();await button('Row above').click();await expect(editor.locator('.sunaissu-rich-text-editor tr')).toHaveCount(initialRows+1);await button('Column after').click();await inspect('table-expanded');
      await button('Image').click();await inspect('image-panel',true);await panel.locator('input[type=file]').setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')});await expect(editor.getByRole('status')).toHaveText('Image inserted');await page.getByRole('button',{name:'Close panel',exact:true}).click();await editor.locator('.sunaissu-rich-text-editor img').locator('..').scrollIntoViewIfNeeded();await expect(editor.locator('.sunaissu-rich-text-editor img')).toBeVisible();await inspect('image-upload');
      await setSource('$\\frac{1}{2}$\n\n$$\nx^2 + y^2 = z^2\n$$');await mode('Preview');await expect(editor.locator('.katex').first()).toBeVisible();await inspect('inline-and-block-equations');
      await mode('Markdown');await source.fill('/');await source.press('End');await source.press('a');await source.press('Backspace');await expect(page.getByRole('listbox',{name:'Slash commands'})).toBeVisible();await bounded(page.locator('.document-slash-menu'));await page.screenshot({path:path.join(output,`slash-${width}x${height}-${theme}.png`)});await source.press('Escape');await expect(page.locator('.document-slash-menu')).toHaveCount(0);
      await source.fill('/table');await source.press('End');await source.press('a');await source.press('Backspace');await source.press('Enter');await expect(source).toHaveValue(/Column 1/);await inspect('slash-command-keyboard');
      await setSource('Selected text');await mode('Visual');const rich=editor.locator('.sunaissu-rich-text-editor');await rich.click();await page.keyboard.press('ControlOrMeta+a');await expect(page.getByRole('toolbar',{name:'Selection formatting'})).toBeVisible();await bounded(page.getByRole('toolbar',{name:'Selection formatting'}));await page.keyboard.press('Alt+F10');await expect(page.getByRole('toolbar',{name:'Selection formatting'}).getByRole('button',{name:'Bold',exact:true})).toBeFocused();await page.keyboard.press('ArrowRight');await expect(page.getByRole('toolbar',{name:'Selection formatting'}).getByRole('button',{name:'Italic',exact:true})).toBeFocused();await page.keyboard.press('Escape');await inspect('selection-formatting-keyboard');
      await button('Link').click();const dialog=page.getByRole('dialog',{name:'Insert link'});await dialog.getByLabel('Text',{exact:true}).fill('A link');await dialog.getByLabel('Address',{exact:true}).fill('https://example.com');await dialog.getByRole('button',{name:'Insert',exact:true}).click({trial:true});const dialogBox=await dialog.locator('form').boundingBox();assert.ok(dialogBox.y>=0&&dialogBox.y+dialogBox.height<=height,'link fits viewport');await page.screenshot({path:path.join(output,`link-${width}x${height}-${theme}.png`)});await dialog.getByRole('button',{name:'Insert',exact:true}).click();await inspect('link-dialog');
      await page.getByRole('button',{name:'Insert timestamp block',exact:true}).click();await mode('Markdown');assert.match(await source.inputValue(),/Inserted externally/);
      await page.getByRole('button',{name:'Preview as read-only',exact:true}).click();await expect(button('Bold')).toHaveCount(0);await inspect('read-only',true);
      await page.getByRole('button',{name:'Unlock editing',exact:true}).click();await page.getByRole('button',{name:'Reset sample',exact:true}).click();await editor.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${width}x${height}-${theme}.png`)});
      await context.close();console.log(`Document editor ${width}x${height} ${theme} passed`);
    }
    const rotation = await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    const page = await rotation.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(process.env.DOCUMENT_EDITOR_URL || 'http://127.0.0.1:5174');
    const toolbar=page.locator('.sunaissu-document-toolbar'), source=page.getByLabel('Markdown source',{exact:true});
    await toolbar.getByRole('button',{name:'Markdown',exact:true}).click();await source.fill('# Rotation draft\n\nKeep this text while the screen changes.');
    for(const [width,height] of [[844,390],[390,844],[390,400],[568,260]]){
      await source.click();await page.setViewportSize({width,height});await expect(source).toBeFocused();await expect(source).toHaveValue('# Rotation draft\n\nKeep this text while the screen changes.');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await toolbar.getByRole('button',{name:'Link',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Insert link'});await dialog.getByLabel('Address',{exact:true}).fill('https://example.com');await dialog.getByRole('button',{name:'Insert',exact:true}).click({trial:true});
      const box=await dialog.locator('form').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height,'short dialog bounds');await page.screenshot({path:path.join(output,`rotation-link-${width}x${height}.png`)});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(source).toHaveValue('# Rotation draft\n\nKeep this text while the screen changes.');reports.push({width,height,state:'rotation-focused-input-and-dialog'});
    }
    await page.locator('.inspector').getByRole('button',{name:'auto',exact:true}).click();
    for(const colorScheme of ['dark','light']){await page.emulateMedia({colorScheme});await expect(page.locator('.sunaissu-document-editor')).toHaveAttribute('data-theme',colorScheme);}
    reports.push({width:568,height:260,state:'system-theme-changes'});
    await rotation.close();assert.deepEqual(errors,[]);
  }catch(error){errors.push(error.stack||error.message);throw error;}
  finally{fs.writeFileSync(path.join(output,'responsive.json'),JSON.stringify({engine,cases,reports,errors},null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
