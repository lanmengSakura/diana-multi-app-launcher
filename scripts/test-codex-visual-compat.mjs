import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(project, 'src-tauri/resources/diana-runtime');
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(runtime, 'adapter.mjs'), 'utf8');
const readSection = (start, end) => {
  const left = source.indexOf('function ' + start + '(');
  const right = source.indexOf('function ' + end + '(');
  assert.ok(left >= 0 && right > left, start);
  return source.slice(left, source.lastIndexOf('\n', right));
};
// The isolated page gets the same payload as a regular mount. The source tree
// shares its PNGs with theme-preview until the launcher embeds them.
const readRuntimeFile = (file, encoding) => {
  const relative = path.relative(runtime, file);
  return fs.readFileSync(relative.startsWith('assets' + path.sep)
    ? path.join(project, 'theme-preview', relative) : file, encoding);
};
const makePayload = vm.runInNewContext(readSection('dataUrl', 'bootstrap') + '\nbuildPayload', {
  fs: { readFileSync: readRuntimeFile }, path, ROOT: runtime, manifest,
  STYLE_ID: 'diana-fixture-style', fail(message) { throw new Error(message); },
});
const bootstrap = readSection('bootstrap', 'disableExpression');
const probe = vm.runInNewContext(readSection('capabilityExpression', 'capabilityPassed') + '\ncapabilityExpression()');
const probePassed = vm.runInNewContext(readSection('capabilityPassed', 'probePages') + '\ncapabilityPassed');
const screenshotDir = process.env.DIANA_COMPAT_SCREENSHOTS;
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.DIANA_TEST_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1936, height: 1170 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route(/^https?:/, route => route.abort());
const settle = () => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
const art = page.locator('#diana-theme-chrome');
const photo = async (name) => {
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, name + '.png') });
};
const apply = async (mode) => {
  const result = await page.evaluate(payload => window.bootstrap(payload), makePayload(mode));
  assert.equal(result.overlayFound, true);
  assert.equal(result.mode, mode);
  await settle();
};
const dimensions = async () => art.evaluate(el => {
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
});
const homeHTML = '<div data-vscode-context=\'{"chatgpt.supportsNewChatMenu":true}\' class="opaque">' +
  '<div class="group/home-composer-layout home-layout"><div class="home-content">' +
  '<div class="hero"><div data-testid="home-icon">❀</div>你想让我们在这个项目中构建什么？</div>' +
  '<div class="home-footer"><div class="composer" data-composer-layout="default" data-composer-surface-variant="default">' +
  '<textarea aria-label="新聊天输入框" placeholder="随心输入"></textarea></div></div></div></div></div>';
const threadHTML = (count) => {
  const buttons = Array.from({ length: count }, (_, i) =>
    '<button data-thread-user-message-navigation-item-id="turn-' + i + '"' +
    (i === 0 ? ' aria-current="true"' : '') + ' aria-label="定位 ' + i + '">' +
    '<span class="Marker-yc4AoL"' + (i === 5 ? ' data-bookmarked' : '') + '></span></button>').join('');
  const messages = Array.from({ length: count }, (_, i) =>
    '<article data-content-search-unit-key="turn-' + i + '"><p data-user-message-bubble>测试消息 ' +
    (i + 1) + '</p></article>').join('');
  // The desktop footer lives inside the statically positioned scrollport. Its
  // absolute positioning is relative to the thread layout, outside that scroll.
  return '<div class="opaque"><div data-request-input-activity-root class="thread-layout">' +
    '<div class="thread-scroll-container"><div data-thread-user-message-navigation-content>' + messages + '</div>' +
    '<div aria-hidden="true" class="sticky bottom-0"><div aria-hidden="true" class="pointer-events-none from-surface"></div></div>' +
    '<div class="footer-shell"><div data-thread-scroll-footer><div aria-hidden="true" class="pointer-events-none bg-surface"></div>' +
    '<div data-pip-obstacle="thread-footer"><div class="composer" data-composer-layout="default" data-composer-surface-variant="default">' +
    '<textarea aria-label="对话输入框" placeholder="和 Codex 一起工作"></textarea></div></div></div></div></div>' +
    '<nav aria-label="用户消息"><div data-floating-navigation-rail-list data-thread-user-message-navigation-rail-list>' +
    '<div>' + buttons + '</div></div></nav></div></div>';
};
const css = [
  '*{box-sizing:border-box} [hidden]{display:none!important} html,body,#root{height:100%;margin:0} body{font:16px system-ui;background:#0d0c0f;color:#f3eef0}',
  'aside{position:absolute;inset:44px auto 0 0;width:290px;border-right:1px solid #28252b;padding:16px} aside button{margin:0 12px}',
  'main{position:absolute;inset:44px 0 0 290px}.opaque,.home-layout,.home-content,.thread-layout,.thread-scroll-container{height:100%;width:100%}',
  '.opaque{background:var(--diana-surface,#0d0c0f)}.home-layout,.home-content,.thread-layout{position:relative} .home-content{display:flex;flex-direction:column;align-items:center;justify-content:center}',
  '.hero{margin:auto;text-align:center;font-size:28px}.hero div{font-size:46px;opacity:.45;margin-bottom:22px}.home-footer{position:absolute;inset:auto 0 18px}',
  'button{color:inherit;cursor:pointer;border:0;background:transparent}.composer,.question{max-width:736px;margin:auto;border-radius:20px;background:#29272b;padding:16px;color:#eee}.diana-mode-light :is(.composer,.question){background:#f5eff1;color:#2c2529}',
  'textarea{width:100%;height:60px;border:0;padding:8px;background:transparent;color:inherit}.thread-scroll-container{overflow:auto;}article{height:168px;width:min(720px,100%);margin:auto;padding:16px}',
  '.footer-shell{position:absolute;inset:auto 0 0;z-index:20}.footer-shell [data-thread-scroll-footer]{position:relative;padding-bottom:18px}',
  '.footer-shell [data-pip-obstacle="thread-footer"],.footer-shell [data-pip-obstacle="thread-footer-leading"] > :first-child{position:relative;width:min(768px,100%);margin:auto}',
  '.pointer-events-none{pointer-events:none}.bg-surface{position:absolute;inset:0;background:var(--diana-surface)}.sticky.bottom-0{position:sticky;bottom:0;height:40px}.from-surface{position:absolute;inset:0;background:linear-gradient(transparent,var(--diana-surface))}',
  '.question{height:210px;margin-bottom:8px}.question button{background:#4e4450;padding:5px}.attachment{height:80px;margin-bottom:12px}',
  'nav{position:absolute;top:50%;left:16px;z-index:20;width:38px;transform:translateY(-50%)}[data-floating-navigation-rail-list]{max-height:62vh;overflow-y:auto;scrollbar-width:none}nav button{position:relative;display:flex;align-items:center;height:10px;width:32px;padding:0 2px}',
  '.Marker-yc4AoL{--marker-progress:var(--navigation-rail-audio-level,0);width:30px;height:2px;opacity:.4;color:#999;display:flex;position:relative}.Marker-yc4AoL::before,.Marker-yc4AoL[data-bookmarked]::after{content:"";background-color:currentColor;height:100%}.Marker-yc4AoL::before{width:26px;transform:scaleX(.2308);transform-origin:left}.Marker-yc4AoL[data-bookmarked]::after{position:absolute;left:2px;width:2px}',
  'button[data-scrub-target] .Marker-yc4AoL{--marker-progress:1}button:has(+button[data-scrub-target]) .Marker-yc4AoL{--marker-progress:.7}',
].join('\n');
const scrollToAndCheckComposer = async (fraction) => {
  await page.locator('.thread-scroll-container').evaluate((el, fraction) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction;
  }, fraction);
  await settle();
  const box = page.getByRole('textbox', { name: '对话输入框' });
  const state = await box.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      gap: Math.round(window.innerHeight - rect.bottom),
      hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el,
      owner: el.closest('.footer-shell').offsetParent?.hasAttribute('data-request-input-activity-root') ?? false,
    };
  });
  assert.ok(state.gap >= 0 && state.gap < 90 && state.hit,
    'composer must stay clickable at the viewport bottom after scrolling ' + fraction + ': ' + JSON.stringify(state));
  if (fraction > 0) assert.equal(state.owner, true);
  return state.gap;
};
try {
  await page.setContent('<!doctype html><html lang="zh-CN"><head><style>' + css + '</style></head><body><div id="root">' +
    '<aside class="app-shell-left-panel"><strong>Codex</strong><button id="bell" aria-pressed="true" aria-label="关闭活动视图"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M3.6 11.5h8.8l-1.1-1.7V6.9a3.3 3.3 0 0 0-6.6 0v2.9l-1.1 1.7ZM6.8 13.2q1.2 1.6 2.4 0"/></svg></button>' +
    '<button id="other" aria-pressed="true" aria-label="搜索">⌕</button></aside><main>' + homeHTML + '</main></div></body></html>');
  await page.addScriptTag({ content: bootstrap });
  await page.evaluate(() => {
    document.addEventListener('click', event => {
      const element = event.target.closest('button');
      if (element?.id === 'bell') {
        const on = element.getAttribute('aria-pressed') !== 'true';
        element.setAttribute('aria-pressed', String(on));
        element.setAttribute('aria-label', on ? '关闭活动视图' : '查看活动');
      }
      if (element?.matches('[data-thread-user-message-navigation-item-id]')) {
        document.querySelectorAll('nav [aria-current]').forEach(b => b.removeAttribute('aria-current'));
        element.setAttribute('aria-current', 'true');
        document.querySelector('[data-content-search-unit-key="' + element.dataset.threadUserMessageNavigationItemId +
          '"]').scrollIntoView({ block: 'center' });
      }
      if (element?.id === 'answer') element.textContent = '已选择';
    });
  });
  await apply('dark');
  assert.ok(await art.evaluate(el => el.parentElement.classList.contains('home-layout') && el.classList.contains('dream-home-shell')));
  assert.deepEqual(await dimensions(), { left: 290, top: 44, width: 1646, height: 1126 });
  assert.equal(await art.evaluate(el => getComputedStyle(el, '::after').backgroundImage.startsWith('url("data:image/png')), true);
  assert.equal(await art.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.waitForFunction(() => Boolean(document.fonts.status === 'loaded'));
  await page.getByRole('textbox').fill('试写');
  assert.equal(await page.getByRole('textbox').inputValue(), '试写');
  await photo('new-chat-1936-night');
  assert.equal(await page.locator('nav').count(), 0);
  const accent = () => page.locator('#bell').evaluate(el => getComputedStyle(el).color);
  assert.equal(await accent(), 'rgb(216, 110, 145)');
  assert.notEqual(await page.locator('#other').evaluate(el => getComputedStyle(el).color), await accent());
  await page.locator('#bell').click();
  assert.equal(await page.locator('#bell').getAttribute('aria-pressed'), 'false');
  await page.mouse.move(400, 20);
  assert.equal(await accent(), 'rgb(169, 161, 167)');
  await page.locator('#bell').evaluate(el => el.setAttribute('aria-label', '查看活动，有聊天需要关注'));
  assert.equal(await accent(), 'rgb(169, 161, 167)');
  await page.locator('#bell').hover();
  assert.equal(await accent(), 'rgb(216, 110, 145)');
  await page.locator('#bell').click();
  await page.locator('main').evaluate((el, html) => {
    el.firstElementChild.hidden = true;
    el.insertAdjacentHTML('beforeend', html);
  }, threadHTML(164));
  await settle();
  assert.ok(await art.evaluate(el => el.parentElement.hasAttribute('data-request-input-activity-root') && !el.classList.contains('dream-home-shell')));
  assert.equal(await art.count(), 1);
  const bottomGap = await scrollToAndCheckComposer(0);
  assert.equal(await scrollToAndCheckComposer(.5), bottomGap);
  assert.equal(await scrollToAndCheckComposer(1), bottomGap);
  const editor = page.getByRole('textbox', { name: '对话输入框' });
  await editor.click();
  await editor.pressSequentially('hello');
  assert.equal(await editor.inputValue(), 'hello');
  assert.equal(await scrollToAndCheckComposer(0), bottomGap);
  const marks = page.locator('nav [data-thread-user-message-navigation-item-id]');
  assert.equal(await marks.count(), 164);
  assert.equal(await page.locator('nav [data-diana-rail-major="true"]').count(), 33);
  const markerStyle = (index) => marks.nth(index).evaluate(b => {
    const el = b.firstElementChild;
    const mark = getComputedStyle(el, '::before'), dot = getComputedStyle(el, '::after');
    return { color: mark.backgroundColor, length: new DOMMatrixReadOnly(mark.transform).a,
      dotOffset: new DOMMatrixReadOnly(dot.transform).e, dot: dot.content,
      star: getComputedStyle(b, '::before').content };
  });
  const checkAudioResponse = async () => {
    const audioLevel = '--navigation-rail-audio-level';
    // The native client publishes independent band levels on individual buttons.
    const samples = [1, 5].map(index => marks.nth(index));
    const resting = await Promise.all(samples.map(button =>
      button.evaluate(el => Number(el.style.getPropertyValue('--diana-art-scale')))));
    const levels = [[.06, .09], [.75, .18], [.12, 1], [0, 0]];
    const current = page.locator('nav button[data-diana-viewport-current="true"]');

    for (const [one, five] of levels) {
      await samples[0].evaluate((el, amount) => el.style.setProperty('--navigation-rail-audio-level', amount), String(one));
      await samples[1].evaluate((el, amount) => el.style.setProperty('--navigation-rail-audio-level', amount), String(five));
      const ordinary = await markerStyle(1);
      const bookmarked = await markerStyle(5);
      const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001,
        'audio tick ' + actual + ' != ' + expected);
      closeTo(ordinary.length, resting[0] + (1 - resting[0]) * one);
      closeTo(bookmarked.length, resting[1] + (1 - resting[1]) * five);
      closeTo(bookmarked.dotOffset, 26 * bookmarked.length);
    }

    await samples[1].evaluate((el, property) => {
      el.style.setProperty(property, '.15');
      el.setAttribute('data-scrub-target', '');
    }, audioLevel);
    assert.equal((await markerStyle(5)).length, 1);
    await samples[1].evaluate(el => el.removeAttribute('data-scrub-target'));
    assert.ok((await markerStyle(5)).length < 1);
    await current.evaluate((el, property) => el.style.setProperty(property, '.05'), audioLevel);
    assert.equal(await current.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el.firstElementChild, '::before').transform).a), 1);
    for (const button of [...samples, current]) {
      await button.evaluate((el, property) => el.style.removeProperty(property), audioLevel);
    }
    assert.equal((await markerStyle(1)).length, resting[0]);
    assert.equal((await markerStyle(5)).length, resting[1]);
  };
  await checkAudioResponse();
  assert.deepEqual((await markerStyle(0)).color, 'rgb(232, 132, 166)');
  assert.equal((await markerStyle(0)).star, '""');
  assert.equal((await markerStyle(1)).color, 'rgb(100, 53, 72)');
  const book = await markerStyle(5);
  assert.equal(book.color, 'rgb(117, 64, 87)');
  assert.equal(book.dot, '""');
  assert.ok(Math.abs(book.length * 26 - book.dotOffset) < .01);
  await marks.nth(10).evaluate(b => b.setAttribute('data-scrub-target', ''));
  assert.ok((await markerStyle(9)).length > .75 && (await markerStyle(10)).length === 1);
  await marks.nth(10).evaluate(b => b.removeAttribute('data-scrub-target'));
  await marks.nth(8).click();
  await settle();
  assert.equal(await marks.nth(8).getAttribute('data-diana-viewport-current'), 'true');
  assert.equal(await page.locator('nav [data-diana-viewport-current]').count(), 1);
  assert.ok(await page.locator('.thread-scroll-container').evaluate(scroller => scroller.scrollTop > 0));
  assert.equal(await page.locator('.diana-footer-backing').count(), 2);
  await page.setViewportSize({ width: 2560, height: 1392 });
  await settle();
  assert.deepEqual(await dimensions(), { left: 290, top: 44, width: 2270, height: 1348 });
  // Two tab surfaces may coexist while a minimized renderer has animation frames paused.
  const previousThread = page.locator('main > .opaque').last();
  await previousThread.evaluate((el, next) => {
    el.setAttribute('data-app-shell-active-page', 'true');
    el.insertAdjacentHTML('afterend', next);
    el.nextElementSibling.style.cssText = 'position:absolute;inset:0';
    el.nextElementSibling.setAttribute('data-app-shell-active-page', 'false');
  }, threadHTML(3));
  await settle();
  const switchedWithoutFrame = await page.evaluate(async () => {
    const previous = document.querySelector('[data-app-shell-active-page="true"]');
    const next = previous.nextElementSibling;
    const frame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      previous.setAttribute('data-app-shell-active-page', 'false');
      next.setAttribute('data-app-shell-active-page', 'true');
      await new Promise(resolve => setTimeout(resolve, 0));
      const selected = next.contains(document.querySelector('#diana-theme-chrome'));
      next.setAttribute('data-app-shell-active-page', 'false');
      previous.setAttribute('data-app-shell-active-page', 'true');
      await new Promise(resolve => setTimeout(resolve, 0));
      return selected && previous.contains(document.querySelector('#diana-theme-chrome'));
    } finally {
      window.requestAnimationFrame = frame;
      next.remove();
      previous.removeAttribute('data-app-shell-active-page');
    }
  });
  assert.equal(switchedWithoutFrame, true, 'art and footer must follow the selected tab even without an animation frame');
  await settle();
  // Real app tabs each own a main element. An inactive tab can be first in DOM order.
  await page.locator('main').first().evaluate((main, thread) => {
    main.insertAdjacentHTML('beforebegin', '<main hidden data-app-shell-active-page="false">' + thread + '</main>');
  }, threadHTML(1));
  assert.equal((await page.evaluate(probe)).surfaceVisible, true, 'the mount probe must inspect the visible main');
  await page.locator('main[hidden]').evaluate(el => el.remove());
  await settle();
  // The screenshot's dark strip crossed the ankle in the normal, collapsed footer.
  const rightOfComposer = await page.locator('[data-pip-obstacle="thread-footer"]').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const x = Math.ceil(rect.right + 24), y = Math.ceil(rect.top);
    return { x, y, width: window.innerWidth - x, height: window.innerHeight - y };
  });
  const margin = () => page.screenshot({ clip: rightOfComposer, animations: 'disabled', caret: 'hide' });
  const themedMargin = await margin();
  const hideBackdrops = await page.addStyleTag({ content: '.diana-footer-backing{visibility:hidden!important}' });
  assert.ok(themedMargin.equals(await margin()), 'footer backdrops must leave the artwork beside the editor intact');
  await hideBackdrops.evaluate(el => el.remove());
  const fullWidthBackdrops = await page.addStyleTag({ content: '.diana-footer-backing{clip-path:none!important}' });
  assert.ok(!themedMargin.equals(await margin()), 'the sampled artwork must intersect the native footer band');
  await fullWidthBackdrops.evaluate(el => el.remove());
  await photo('conversation-2560-night');
  await apply('light');
  assert.equal(await accent(), 'rgb(184, 73, 112)');
  await photo('conversation-2560-day');
  await apply('dark');
  await page.setViewportSize({ width: 2018, height: 1170 });
  await page.locator('[data-pip-obstacle="thread-footer"]').evaluate(el => {
    el.insertAdjacentHTML('beforebegin', '<div data-pip-obstacle="thread-footer-leading"><div>' +
      '<div class="question">需要补充信息<br><button id="answer">选择</button></div></div></div>');
    el.querySelector('.composer').insertAdjacentHTML('afterbegin', '<div class="attachment" data-composer-attachment-pill>附件</div>');
  });
  await settle();
  assert.equal(await page.locator('.diana-footer-backing').count(), 2);
  for (const layer of await page.locator('.diana-footer-backing').all()) {
    const result = await layer.evaluate(el => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      const column = document.querySelector('[data-pip-obstacle="thread-footer"]').getBoundingClientRect();
      return [rect.left + parseFloat(style.getPropertyValue('--diana-footer-left')) - column.left,
        rect.right - parseFloat(style.getPropertyValue('--diana-footer-right')) - column.right,
        style.clipPath.startsWith('inset(')];
    });
    assert.deepEqual(result, [-24, 24, true]);
  }
  await page.locator('#answer').click();
  assert.equal(await page.locator('#answer').textContent(), '已选择');
  await photo('expanded-footer-2018-night');
  await apply('light');
  assert.equal(await page.locator('.diana-footer-backing').count(), 2);
  await photo('expanded-footer-2018-day');
  await apply('dark');
  await page.setViewportSize({ width: 830, height: 860 });
  await settle();
  assert.equal(await page.locator('.diana-footer-backing').count(), 0);
  await page.setViewportSize({ width: 1936, height: 1170 });
  await settle();
  assert.equal(await page.locator('.diana-footer-backing').count(), 2);
  await page.locator('[data-composer-attachment-pill]').evaluate(el => el.remove());
  await page.locator('[data-pip-obstacle="thread-footer-leading"]').evaluate(el => el.remove());
  await settle();
  assert.equal(await page.locator('.diana-footer-backing').count(), 2);
  await apply('light');
  assert.equal(await art.count(), 1);
  assert.notEqual(await accent(), 'rgb(216, 110, 145)');
  assert.notEqual((await markerStyle(1)).color, 'rgb(100, 53, 72)');
  await checkAudioResponse();
  for (const count of [12, 48, 101, 217]) {
    await page.locator('main').evaluate((el, html) => {
      el.lastElementChild.remove();
      el.insertAdjacentHTML('beforeend', html);
    }, threadHTML(count));
    await settle();
    assert.equal(await page.locator('nav [data-diana-rail-major="true"]').count(), Math.ceil(count / 5));
    assert.equal(await page.locator('nav [data-diana-viewport-current="true"]').count(), 1);
    await marks.nth(count - 1).click();
    await settle();
    await checkAudioResponse();
    assert.equal(await marks.nth(count - 1).getAttribute('data-diana-viewport-current'), 'true');
    assert.ok(await art.evaluate(el => el.isConnected && el.parentElement.hasAttribute('data-request-input-activity-root')));
    await scrollToAndCheckComposer(1);
  }
  await page.locator('main').evaluate(el => {
    el.lastElementChild.remove();
    el.firstElementChild.hidden = false;
  });
  await settle();
  assert.ok(await art.evaluate(el => el.classList.contains('dream-home-shell')));
  await photo('new-chat-1936-day');
  await page.evaluate(() => document.documentElement.classList.add('compact-window'));
  assert.equal(await art.evaluate(el => getComputedStyle(el).display), 'none');
  await page.evaluate(() => {
    document.documentElement.classList.remove('compact-window');
    window.dispatchEvent(new Event('resize'));
    window.__dianaMachineLocalAdapter.disable();
  });
  await settle();
  assert.equal(await page.locator('#diana-theme-chrome, .diana-skin-surface, .diana-skin-foreground, .diana-footer-backing, [data-diana-position-patched], #diana-fixture-style').count(), 0);
  // Earlier desktop builds had a nested marker line and no semantic composer attributes.
  await page.locator('main').evaluate(el => {
    el.innerHTML = '<div class="thread-scroll-container" style="height:calc(100% - 120px)"><p data-message-author-role="user">旧版消息</p></div>' +
      '<div class="_ComposerLayoutRoot_legacy"><textarea aria-label="旧版输入框"></textarea></div>' +
      '<nav aria-label="用户消息"><button><span><span><span></span></span></span></button></nav>';
  });
  const older = await page.evaluate(probe);
  assert.ok(probePassed(older) && older.composerPresent && older.threadPresent, JSON.stringify(older));
  for (const mode of ['light', 'dark']) {
    await apply(mode);
    assert.equal(await art.evaluate(el => el.parentElement.tagName), 'MAIN');
    const legacyButton = page.locator('nav button');
    assert.equal(await legacyButton.getAttribute('data-diana-rail-major'), 'true');
    assert.equal(await legacyButton.locator('span > span > span').evaluate(el => getComputedStyle(el).height), '2px');
    await page.getByRole('textbox', { name: '旧版输入框' }).fill(mode);
  }
  await page.evaluate(() => window.__dianaMachineLocalAdapter.disable());
  await page.setContent('<html><body><section>等待客户端载入</section></body></html>');
  assert.equal(probePassed(await page.evaluate(probe)), false);
  assert.deepEqual(errors, []);
  console.log('Passed offline: current and legacy layouts, both themes, native audio levels, navigation, footer, cleanup and unrecognized surface.');
} finally {
  await browser.close();
}
