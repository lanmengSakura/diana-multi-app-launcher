import cursorCss from './theme-sources/cursor.css?raw';
import grokCss from './theme-sources/grok.css?raw';
import zcodeCss from '../src-tauri/resources/theme-packs/zcode/runtime/theme.css?raw';
import doubaoCss from '../src-tauri/resources/theme-packs/doubao/extension/diana.css?raw';
import vscodeCss from '../src-tauri/resources/theme-packs/vscode/visual-layer/diana-workbench.css?raw';
import deepseekCss from '../src-tauri/resources/theme-packs/deepseek/diana.css?raw';
import night from '../theme-preview/assets/diana-night-v3.png';
import day from '../theme-preview/assets/diana-corner-cutout-v2.png';
import corner from '../theme-preview/assets/diana-left-top-detailed-corner-mask-v7.png';
import upper from '../theme-preview/assets/diana-line-art-approved-upper.png';
import doodle from '../theme-preview/assets/diana-doodle-chalk-v2-approved.png';
import star from '../theme-preview/assets/diana-hand-star-reference-v2.png';
import candy from '../theme-preview/assets/diana-candy-wrapped-v1.png';
import lollipop from '../theme-preview/assets/diana-candy-lollipop-v1.png';
import heart from '../theme-preview/assets/acao-heart-v3.png';
import cheer from '../theme-preview/assets/acao-cheer-v1.png';
import terminal from '../src-tauri/resources/theme-packs/terminal/diana-terminal-bg-v2.png';
import type { DemoConfig } from './theme-catalog';

// All applications reference ONE existing asset collection. No adapter code or
// local profile data is imported. Only the selected app's CSS is installed.
export const art = { night, day, corner, upper, doodle, star, candy, lollipop, heart, cheer, terminal };
const placeholders: Record<string, string> = {
  __DIANA_CORNER__: corner, __DIANA_UPPER__: upper, __DIANA_NIGHT_PORTRAIT__: night,
  __DIANA_DAY_PORTRAIT__: day, __DIANA_DOODLE__: doodle, __DIANA_STAR__: star,
  __DIANA_CANDY__: candy, __DIANA_LOLLIPOP__: lollipop, __ACAO_HEART__: heart, __ACAO_CHEER__: cheer,
};
const vscodeAssets: Record<string, string> = {
  'diana-corner-line.png': corner, 'diana-portrait.png': night, 'diana-portrait-day.png': day,
  'diana-doodle-chalk.png': doodle, 'diana-star.png': star, 'diana-candy.png': candy, 'diana-lollipop.png': lollipop,
};
const sourceAssets: Record<string, string> = {
  'diana-night-v3.png': night, 'diana-corner-cutout-v2.png': day,
  'diana-left-top-detailed-corner-mask-v7.png': corner, 'diana-line-art-approved-upper.png': upper,
  'diana-doodle-chalk-v2-approved.png': doodle, 'diana-hand-star-reference-v2.png': star,
  'diana-candy-wrapped-v1.png': candy, 'diana-candy-lollipop-v1.png': lollipop,
  'acao-heart-v3.png': heart, 'acao-cheer-v1.png': cheer,
};
const resolveAsset = (map: Record<string, string>, name: string) => {
  if (!map[name]) throw new Error(`Missing demo artwork: ${name}`);
  return map[name];
};
const css = {
  codex: '',
  cursor: cursorCss.replace(/__\w+__/g, key => resolveAsset(placeholders, key)),
  grok: grokCss.replace(/__\w+__/g, key => resolveAsset(placeholders, key)),
  zcode: zcodeCss, doubao: doubaoCss,
  vscode: vscodeCss.replace(/\.\/diana-assets\/([^"')]+)/g, (_all, name: string) => resolveAsset(vscodeAssets, name)),
  deepseek: deepseekCss.replace(/\/diana-brand\/([^"')]+)/g, (_all, name: string) => resolveAsset(sourceAssets, name)),
  terminal: '',
};

export function applyTheme(config: DemoConfig) {
  const html = document.documentElement;
  const themed = config.mode !== 'original';
  html.className = themed ? {
    cursor: 'diana-cursor-host', grok: 'diana-grok-host', zcode: `diana-zcode-host theme-zai-${config.mode}`,
    codex: '', doubao: '', vscode: '', deepseek: '', terminal: '',
  }[config.app] : '';
  html.dataset.app = config.app;
  html.dataset.mode = config.mode;
  html.dataset.dianaCursorMode = config.mode;
  html.dataset.dianaGrokMode = config.mode;
  html.dataset.dianaDoubaoMode = config.mode;
  document.body.toggleAttribute('data-ds-dark-theme', config.mode !== 'light');
  let layer = document.getElementById('app-theme-css') as HTMLStyleElement | null;
  if (!layer) { layer = document.createElement('style'); layer.id = 'app-theme-css'; document.head.append(layer); }
  layer.textContent = themed ? css[config.app] : '';
  const vars: Record<string, string> = {
    'diana-zcode-image-character-dark': night, 'diana-zcode-image-character-light': day,
    'diana-zcode-image-corner': corner, 'diana-zcode-image-upper': upper, 'diana-zcode-image-doodle': doodle,
    'diana-zcode-image-star': star, 'diana-zcode-image-candy-wrapped': candy,
    'diana-zcode-image-candy-lollipop': lollipop, 'diana-zcode-image-acao-heart': heart, 'diana-zcode-image-acao-cheer': cheer,
    'diana-doubaowork-corner-image': corner, 'diana-doubaowork-upper-image': upper,
    'diana-doubaowork-doodle-image': doodle, 'diana-doubaowork-portrait-night-image': night,
    'diana-doubaowork-portrait-day-image': day, 'diana-doubaowork-star-image': star,
    'diana-doubaowork-candy-image': candy, 'diana-doubaowork-lollipop-image': lollipop,
    'diana-doubaowork-acao-heart-image': heart, 'diana-doubaowork-acao-cheer-image': cheer,
  };
  for (const [name, url] of Object.entries(vars)) html.style.setProperty(`--${name}`, `url("${url}")`);
}
