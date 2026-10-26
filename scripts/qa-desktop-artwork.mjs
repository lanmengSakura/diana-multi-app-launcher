// Synthetic fixtures only. Never connects to installed target apps or profiles.
import {chromium} from 'playwright-core';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('artifacts/desktop-adaptation');await mkdir(out,{recursive:true});
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!exe)throw new Error('No headless test browser found');
const browser=await chromium.launch({executablePath:exe,headless:true});
const results=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  const client=await readFile('src-tauri/resources/theme-packs/deepseek/desktop-plugin/client.js','utf8');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<html><head><style>html,body{margin:0;height:100%;font:14px sans-serif;background:#fff}#sidebar{position:absolute;width:280px;inset:0 auto 0 0;background:#191919}#root{position:absolute;inset:0 0 0 280px}.an3WzG_root{position:relative;height:100%;background:var(--dsw-alias-bg-base)}header{height:76px;border-bottom:1px solid #aaa}#transcript{height:300px;overflow:auto;margin:20px 100px;color:var(--dsw-alias-label-primary)}#composer{position:absolute;bottom:20px;left:10%;width:80%;height:90px;background:var(--dsw-specific-input-major);z-index:7}button{padding:12px}#dialog{position:absolute;z-index:100;top:200px;left:100px;background:#fff}textarea{width:70%}</style></head><body><aside id=sidebar></aside><main id=root><section class=an3WzG_root data-phase=active><header>DeepSeek Harness · 离线布局检查</header><div id=transcript>${'<p>用于检查滚动和对比度的合成内容，不读取真实对话。</p>'.repeat(25)}</div><div id=composer><textarea aria-label=输入></textarea><button id=send>发送测试</button></div></section></main></body></html>`);
  const before=await page.locator('#composer').boundingBox();
  await page.evaluate(()=>{
    window.disposers=[];window.palette='light';window.tokenLayer=null;
    window.applyPalette=mode=>{window.palette=mode;document.body.toggleAttribute('data-ds-dark-theme',mode==='dark');if(window.tokenLayer)for(const [name,pair] of Object.entries(window.tokenLayer))document.body.style.setProperty(name,pair[mode]);};
    window.ctx={effect(fn){window.disposers.push(fn());},theme:{overrideTokens(source,tokens){window.tokenLayer=tokens;window.applyPalette(window.palette);return()=>{for(const name of Object.keys(tokens))document.body.style.removeProperty(name);window.tokenLayer=null;};}}};
    window.__ModuleLoader__={load(row){window.plugin=row.factory();}};
  });
  await page.addScriptTag({content:client});
  for(const mode of ['light','dark']) {
    await page.evaluate(mode=>{window.plugin.apply(window.ctx);window.applyPalette(mode);},mode);
    assert.equal(await page.locator('.diana-dsh-art').count(),1);
    assert.deepEqual(await page.locator('#composer').boundingBox(),before);
    const stats=await page.evaluate(()=>{const art=document.querySelector('.diana-dsh-art');const button=document.getElementById('send');const r=button.getBoundingClientRect();return {mode:window.palette,pointer:getComputedStyle(art).pointerEvents,z:getComputedStyle(art).zIndex,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===button,background:getComputedStyle(document.querySelector('.an3WzG_root')).backgroundColor,doodle:getComputedStyle(document.querySelector('.diana-dsh-doodle')).backgroundColor};});
    assert.equal(stats.pointer,'none');assert.equal(stats.z,'-1');assert.ok(stats.hit);
    await page.locator('textarea').fill('输入与 Tab 焦点测试');await page.keyboard.press('Tab');assert.ok(await page.locator('#send').evaluate(el=>document.activeElement===el));
    await page.locator('#transcript').evaluate(el=>el.scrollTop=160);assert.ok(await page.locator('#transcript').evaluate(el=>el.scrollTop>0));
    await page.screenshot({path:resolve(out,`deepseek-${mode}.png`)});
    results.push(stats);
    await page.evaluate(()=>{for(const dispose of window.disposers.reverse())dispose?.();window.disposers=[];});
    assert.equal(await page.locator('.diana-dsh-art').count(),0);assert.equal(await page.locator('style[data-plugin="dsh-diana-theme"]').count(),0);
    assert.equal(await page.locator('body').getAttribute('class'),'');
  }
  assert.deepEqual(errors,[]);
  // ZCode fixture uses the exact native frame markers from 3.16.3.
  const {expression:makeExpression}=await import('../src-tauri/resources/theme-packs/zcode/runtime-3.16.3/adapter.mjs');
  const expression=mode=>makeExpression(mode,resolve('theme-preview/assets'),resolve('src-tauri/resources/theme-packs/zcode/runtime/theme.css'));
  {
    await page.setContent(`<html class=theme-zai-dark><head><style>html,body{margin:0;height:100%;}#content{position:absolute;inset:40px 0 0 260px}section{position:relative;height:100%;background:#111}textarea{position:absolute;bottom:25px;left:10%;width:75%;height:80px;z-index:7;background:var(--color-input)}</style></head><body><div id=root><div id=content data-panel><section data-workspace-conversation-frame=true><textarea aria-label=输入></textarea></section></div></div></body></html>`);
    const original=await page.locator('textarea').boundingBox();
    for(const mode of ['dark','light','auto']) {
      const status=await page.evaluate(expression(mode));
      assert.ok(status.mounted && status.pointerSafe && status.belowContent);
      assert.deepEqual(await page.locator('textarea').boundingBox(),original);
      if(mode!=='auto')assert.equal(status.rootTheme,mode);
      await page.locator('textarea').fill('不会被美术层阻挡');
      await page.screenshot({path:resolve(out,`zcode-${mode}.png`)});
      results.push({zcode:mode,...status});
    }
    await page.evaluate(()=>window.__DIANA_ZCODE_THEME__.disable());
    assert.equal(await page.locator('#diana-zcode-chrome').count(),0);
    assert.equal(await page.locator('html').getAttribute('class'),'theme-zai-dark');
    // Auto follows a native light/dark change and survives native frame replacement.
    await page.evaluate(expression('auto'));
    await page.locator('html').evaluate(el=>{el.classList.remove('theme-zai-dark');el.classList.add('theme-zai-light');});
    assert.equal(await page.evaluate(()=>window.__DIANA_ZCODE_THEME__.snapshot().rootTheme),'light');
    await page.locator('section').evaluate(el=>{const replacement=el.cloneNode(true);replacement.querySelector('#diana-zcode-chrome')?.remove();el.replaceWith(replacement);});
    await page.waitForFunction(()=>window.__DIANA_ZCODE_THEME__.snapshot().mounted);
    assert.equal(await page.locator('#diana-zcode-chrome').count(),1);
    await page.evaluate(()=>window.__DIANA_ZCODE_THEME__.disable());
    assert.equal(await page.locator('html').getAttribute('class'),'theme-zai-light');
    assert.equal(await page.locator('#diana-zcode-runtime-style').count(),0);
    await page.locator('section').evaluate(el=>el.removeAttribute('data-workspace-conversation-frame'));
    assert.equal((await page.evaluate(expression('dark'))).mounted,false);
  }
  await writeFile(resolve(out,'report.json'),JSON.stringify({syntheticOnly:true,realAppsTouched:false,results},null,2));
  console.log(JSON.stringify({status:'passed',syntheticOnly:true,cases:results.length,output:out}));
}finally{await browser.close();}
