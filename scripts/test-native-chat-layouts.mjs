import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the actual components without a browser, network, installed app or model.
function compile(file) {
  return ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
}
const catalogExports={};
vm.runInNewContext(compile('demo/theme-catalog.ts'),{exports:catalogExports,URLSearchParams,URL});
const pageSource=compile('demo/theme-app.tsx');
function render(app,mode='dark',scene='conversation') {
  let html='';
  const location={search:`?app=${app}&theme=${mode}&scene=${scene}`,origin:'https://demo.test',replace:()=>{throw new Error('Unexpected redirect');}};
  const dependencies={
    'react':React,'react/jsx-runtime':jsxRuntime,
    'react-dom/client':{createRoot:()=>({render:element=>{html=renderToStaticMarkup(element);}})},
    './theme-catalog':catalogExports,'./theme-art':{applyTheme:()=>{},art:{terminal:'/assets/terminal.png'}},
  };
  vm.runInNewContext(pageSource,{
    exports:{},URLSearchParams,URL,location,
    window:{parent:{},location},document:{getElementById:()=>({})},
    require:name=>{
      if(name.endsWith('.css')) return {};
      if(name.endsWith('.svg')) return '/assets/harness-fish.svg';
      assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];
    },
  });
  return html;
}
test('Doubao has native home segmentation, complete tool labels and visible-layer doodle hook',()=>{
  for(const mode of ['light','dark']) {
    const html=render('doubao',mode,'home');
    for(const label of ['新工作任务','定时任务','云盘','API 服务','图像生成','视频生成','解题答疑','AI 播客','为你推荐','db-work-switch','db-sidebar-doodle','db-compose-area']) assert.ok(html.includes(label),label);
    assert.doesNotMatch(html,/深度思考|联网搜索|今天有什么想聊的/);
  }
  assert.match(readFileSync('demo/native-chats.css','utf8'),/\.db-sidebar \.db-sidebar-doodle \{ position:absolute; z-index:0;/);
});
test('Cursor uses a single-row native composer and window-relative column, not generic chat cards',()=>{
  const html=render('cursor');
  for(const label of ['cu-composer','This PC','Getting Started','Connect Slack','On Home','Browser','Send follow-up']) assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/class="composer-tools"|class="turn-author"|class="plan-card"/);
  const css=readFileSync('demo/native-chats.css','utf8');
  assert.ok(css.includes('calc((100vw - 764px)/2 - var(--sidebar))'));
  assert.match(css,/\.cu-composer \{[^}]*min-height:42px;/);
});
test('Harness preserves session tabs, identity, reasoning and real field labels without invented telemetry',()=>{
  const html=render('deepseek');
  for(const label of ['DSH 本地构建','harness-fish','标准模式','Session 日志','轨迹','已思考','系统提示词','本轮用量','Workspace Write','ds-usage','缓存命中 —%','输入 — tok']) assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/class="turn-author"|class="plan-card"|class="demo-profile"/);
});
test('all three preserve native shells for home/conversation and remove art in original reference',()=>{
  for(const app of ['doubao','cursor','deepseek']) for(const scene of ['home','conversation']) for(const mode of ['dark','light','original']) {
    const html=render(app,mode,scene);
    assert.ok(html.includes(`native-${app}`));
    assert.equal((html.match(/<form\b/g)||[]).length,1);
    if(mode==='original') assert.doesNotMatch(html,/id="diana-[^"]+"|class="harness-overlay"|db-sidebar-doodle/);
    assert.doesNotMatch(html,/AppData|localhost:3080|Users\\|sk-[a-zA-Z0-9]{16,}/);
  }
});
