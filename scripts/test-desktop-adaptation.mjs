import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectBundle,pluginStatus} from './manage-deepseek-desktop.mjs';
test('desktop bundle selection preserves unrelated data and restores exactly',()=>{
  const original={name:'dsh-profile-desktop',dependencies:{other:'file:/keep'},dsh:{profile:{bundles:['base','web'],custom:true},other:1},private:true};
  const enabled=selectBundle(original,true);
  assert.deepEqual(selectBundle(enabled,true),enabled);
  assert.deepEqual(selectBundle(enabled,false),original);
  assert.deepEqual(original.dsh.profile.bundles,['base','web']);
});
test('non desktop profiles and invalid structures cannot be modified',()=>{
  for(const value of [{},{name:'dsh-profile-web',dsh:{profile:{bundles:[]}}},{name:'dsh-profile-desktop',dsh:{profile:{bundles:'bad'}}}])assert.throws(()=>selectBundle(value,true));
});
test('installed and enabled states are distinct',()=>{
  assert.deepEqual(pluginStatus({dependencies:{'dsh-diana-theme':'file:x'}}),{installed:true,selected:false});
  assert.deepEqual(pluginStatus({dsh:{profile:{bundles:['dsh-diana-theme']}}}),{installed:false,selected:true});
});
test('desktop bundle uses official plugin lifecycle and no debugging/network APIs',()=>{
  const path=new URL('../src-tauri/resources/theme-packs/deepseek/desktop-plugin/',import.meta.url);
  const pkg=JSON.parse(readFileSync(new URL('package.json',path),'utf8'));
  assert.equal(pkg.dsh.client.platform,'web');
  assert.ok(pkg.dsh.bundle.patch);
  const client=readFileSync(new URL('client.js',path),'utf8');
  assert.ok(client.includes('overrideTokens'));
  for(const forbidden of ['fetch(', 'WebSocket(', 'localStorage', 'sessionStorage', 'textContent.toString', 'remote-debugging'])assert.ok(!client.includes(forbidden),forbidden);
  const payload=JSON.parse(client.match(/const \{ css, tokens \} = (.*);\n/)[1]);
  for(const pair of Object.values(payload.tokens)){assert.equal(typeof pair.light,'string');assert.equal(typeof pair.dark,'string');}
  assert.ok(!payload.css.includes('/diana-brand/'));
  assert.ok(!payload.css.includes('asset:'));
  assert.ok(payload.css.includes('right 0 bottom 128px'), 'retains approved laptop-session placement');
  assert.ok(payload.css.includes('--diana-session-character-size'), 'retains approved large-screen scaling');
  assert.ok(payload.css.includes(".diana-dsh-surface[data-phase='active']"), 'maps only the native active conversation');
});
