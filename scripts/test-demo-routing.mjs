import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Unit fixtures only: no browser, screenshot, installed app or native process.
function loadTs(file, globals = {}, dependencies = {}) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; }, URLSearchParams, URL, ...globals }, { filename: file });
  return exports;
}
const catalog = loadTs('demo/theme-catalog.ts');
const targets = { codex:'codex', doubao:'doubao', cursor:'cursor', grokbot:'grok', zcode:'zcode', vscode:'vscode', terminal:'terminal', deepseek:'deepseek' };
const plain = value => JSON.parse(JSON.stringify(value));

test('eight app routes, original reference, system resolution, and return links', () => {
  assert.equal(catalog.apps.length, 8);
  for (const [target, app] of Object.entries(targets)) {
    for (const theme of ['dark', 'light', 'system']) {
      for (const prefersDark of [true, false]) {
        const config = catalog.fromLauncher(target, theme, false, prefersDark);
        assert.equal(config.app, app);
        assert.equal(config.mode, app === 'terminal' ? 'dark' : theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme);
        assert.deepEqual(plain(catalog.parseConfig(catalog.configQuery(config))), plain(config));
        assert.ok(catalog.framePath(config).startsWith(app === 'codex' ? '/codex.html?' : '/theme-app.html?'));
        assert.match(catalog.launcherPath(config), new RegExp(`app=${app}`));
      }
    }
    assert.equal(catalog.fromLauncher(target, 'dark', true).mode, 'original');
  }
  assert.equal(catalog.fromLauncher('__proto__', 'dark'), null);
  assert.equal(catalog.isConfig({ app:'codex', mode:'javascript:', scene:'home' }), false);
});

function bridgeFixture({ dark = true, standalone = false, search = '' } = {}) {
  const sent = [], navigated = [], events = {}, preferences = new Map();
  const location = { origin:'https://demo.test', search, assign: url => navigated.push(url) };
  const parent = { location, postMessage: (message, origin) => { assert.equal(origin, location.origin); sent.push(plain(message)); } };
  const window = { location, parent, setTimeout: callback => { callback(); return 1; }, addEventListener: (name, callback) => { events[name] = callback; } };
  if (standalone) { window.parent = window; window.postMessage = parent.postMessage; }
  const localStorage = { setItem: (key, value) => preferences.set(key, value), getItem: key => preferences.get(key) ?? null };
  loadTs('demo/bridge.ts', { window, location, localStorage, structuredClone, matchMedia: () => ({matches:dark}), __DEMO_MUSIC_BYTES__:0,
    MutationObserver: class { observe() {} }, document:{ getElementById: () => ({}) },
    fetch: () => { throw new Error('Unit actions must not request a network resource'); }
  }, { './theme-catalog':catalog });
  return { bridge: window.__TAURI_INTERNALS__, sent, navigated, events, parent:window.parent, preferences };
}
test('the actual web bridge navigates all launch and restore actions', async () => {
  for (const [target, app] of Object.entries(targets)) for (const original of [false, true]) {
    const fixture = bridgeFixture();
    if (target !== 'codex') {
      const initial = await fixture.bridge.invoke('get_external_target_status', {target});
      assert.notEqual(initial.themeState, 'blocked');
    }
    await fixture.bridge.invoke(target === 'codex' ? 'run_launcher_action' : 'run_external_target_action', {
      target, action:target === 'codex' ? (original ? 'restore' : 'mount') : (original ? 'launch_native' : 'launch_theme'), themeMode:'light'
    });
    const actions = fixture.sent.filter(message => message.type === 'navigate');
    assert.equal(actions.length, 1);
    assert.deepEqual(actions[0].detail, {app, mode:original ? 'original' : app === 'terminal' ? 'dark' : 'light', scene:'conversation'});
  }
});
test('standalone fallback and reverse preference mapping use the same catalog', async () => {
  const fixture = bridgeFixture({standalone:true, search:'?app=grok&theme=light'});
  assert.equal(fixture.preferences.get('diana-launcher-target'), 'grokbot');
  assert.equal(fixture.preferences.get('diana-launcher-theme'), 'light');
  await fixture.bridge.invoke('run_launcher_action', {action:'mount', themeMode:'system'});
  assert.deepEqual(fixture.navigated, ['/themes?app=codex&theme=dark&scene=conversation']);
});
test('explicit simulated failure blocks navigation, retry works; foreign messages ignored', async () => {
  const fixture = bridgeFixture();
  const message = {source:'diana-demo-shell',type:'fail-next'};
  fixture.events.message({origin:'https://attacker.test',source:fixture.parent,data:message});
  await fixture.bridge.invoke('run_launcher_action', {action:'mount',themeMode:'dark'});
  fixture.events.message({origin:'https://demo.test',source:fixture.parent,data:message});
  await assert.rejects(fixture.bridge.invoke('run_launcher_action', {action:'mount',themeMode:'dark'}), /演示异常/);
  assert.equal(fixture.sent.filter(event => event.type === 'navigate').length, 1);
  await fixture.bridge.invoke('run_launcher_action', {action:'mount',themeMode:'dark'});
  assert.equal(fixture.sent.filter(event => event.type === 'navigate').length, 2);
});
test('five built pages reference existing same-origin assets; art is not duplicated', () => {
  const root = resolve('site-build/dist/client');
  for (const name of ['shell', 'launcher', 'themes', 'theme-app', 'codex']) {
    const source = readFileSync(resolve(root, `_diana-${name}.page`), 'utf8');
    for (const [, url] of source.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) assert.ok(existsSync(resolve(root, '.' + url)), url);
    assert.doesNotMatch(source, /(?:C:|E:)\\|Users\\|\bsk-[a-zA-Z0-9]{16,}/);
  }
  const builtAssets = readdirSync(resolve(root, 'assets'));
  for (const file of readdirSync('theme-preview/assets').filter(name => name.endsWith('.png'))) {
    assert.equal(builtAssets.filter(name => name.startsWith(file.slice(0, -4) + '-') && name.endsWith('.png')).length, 1, file);
  }
  assert.ok(readFileSync('demo/codex-preview.js','utf8').includes("event.data.config.app !== 'codex'"));
});
