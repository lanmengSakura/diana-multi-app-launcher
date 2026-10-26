// Pure rules and a refused CLI invocation; no installed app or debugger is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VERSION, ADAPTER, SIGNER, ASAR_SHA256, assertTrust, assertSession, assertListener, selectTarget }
  from '../src-tauri/resources/theme-packs/zcode/runtime-3.16.3/rules.mjs';
const exe=resolve('fixture/中文目录/ZCode.exe');
const session=()=>({version:VERSION,adapterVersion:ADAPTER,executable:exe,pid:123,created:'fixture-created',address:'127.0.0.1',port:50123});
test('both exact version fields, publisher and application resource hash are required',()=>{
  const report={fileVersion:VERSION,productVersion:VERSION,signature:'Valid',signer:SIGNER};
  assert.doesNotThrow(()=>assertTrust(report,ASAR_SHA256));
  for(const patch of [{fileVersion:'3.16.3.0'},{productVersion:'3.6.5.4145'},{signature:'UnknownError'},{signer:'wrong'}]) {
    assert.throws(()=>assertTrust({...report,...patch},ASAR_SHA256));
  }
  assert.throws(()=>assertTrust(report,'0'.repeat(64)));
});
test('association alone cannot manufacture a current owned session',()=>{
  assert.doesNotThrow(()=>assertSession(session(),exe));
  for(const patch of [{address:'0.0.0.0'},{pid:0},{port:9222},{adapterVersion:'local-3.16.3-v1'},{version:'3.6.5.4145'},{executable:exe+'.other'}]) {
    assert.throws(()=>assertSession({...session(),...patch},exe));
  }
  assert.throws(()=>assertSession(null,exe));
});
test('listener requires loopback, exact PID, creation time and visible window',()=>{
  const row={pid:123,address:'127.0.0.1',port:50123,hasWindow:true};
  const processes=[{pid:123,created:'fixture-created'}];
  assert.equal(assertListener(session(),exe,[row],processes).pid,123);
  for(const patch of [{pid:124},{address:'::'},{port:50124},{hasWindow:false}])assert.throws(()=>assertListener(session(),exe,[{...row,...patch}],processes));
  assert.throws(()=>assertListener(session(),exe,[row,row],processes));
  assert.throws(()=>assertListener(session(),exe,[row],[{pid:123,created:'reused-pid'}]));
});
test('only the associated installation renderer and matching loopback WebSocket are accepted',()=>{
  const page={type:'page',url:pathToFileURL(join(resolve('fixture/中文目录'),'resources/app.asar/out/renderer/index.html')).href,
    webSocketDebuggerUrl:'ws://127.0.0.1:50123/devtools/page/fixture'};
  assert.equal(selectTarget([page],exe,50123),page.webSocketDebuggerUrl);
  for(const patch of [{type:'worker'},{url:'https://example.invalid/out/renderer/index.html'},
    {url:page.url.replace('app.asar','other.asar')},{webSocketDebuggerUrl:'ws://192.168.1.2:50123/devtools/page/x'},
    {webSocketDebuggerUrl:'ws://127.0.0.1:50124/devtools/page/x'},
    {webSocketDebuggerUrl:'ws://127.0.0.1:50123/devtools/browser/x'}])assert.throws(()=>selectTarget([{...page,...patch}],exe,50123));
  assert.throws(()=>selectTarget([page,page],exe,50123));
});
test('direct start without explicit approval fails before machine inspection or writes',()=>{
  const script=fileURLToPath(new URL('../src-tauri/resources/theme-packs/zcode/runtime-3.16.3/adapter.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'start'],{encoding:'utf8',env:{...process.env,DIANA_ZCODE_EXE:exe},windowsHide:true});
  assert.equal(result.status,1);assert.match(result.stderr,/RISK_CONFIRMATION_REQUIRED/);
  assert.ok(!existsSync(new URL('../src-tauri/resources/theme-packs/zcode/runtime-3.16.3/state',import.meta.url)));
});
test('public entry point has no author paths, account state or dependence on local registration',()=>{
  const source=readFileSync(new URL('../src-tauri/resources/theme-packs/zcode/runtime-3.16.3/adapter.mjs',import.meta.url),'utf8');
  for(const value of ['F:\\','蓝梦','local-runtime.json','local-zcode','--user-data-dir','localStorage','Cookie'])assert.ok(!source.includes(value),value);
});
