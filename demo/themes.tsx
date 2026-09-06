import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { apps, configQuery, isConfig, parseConfig, type DemoConfig } from './theme-catalog';
import './themes.css';

function Gallery() {
  const [config, setConfig] = useState<DemoConfig>(() => parseConfig(location.search));
  const [size, setSize] = useState('1600');
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const selected = apps.find(app => app.id === config.app)!;
  const width = Number(size), height = size === '1200' ? 820 : 960;
  useEffect(() => {
    const host = viewport.current!;
    const resize = () => setScale(fit ? Math.min((host.clientWidth - 24) / width, (host.clientHeight - 24) / height, 1) : 1);
    const observer = new ResizeObserver(resize);
    observer.observe(host); resize();
    return () => observer.disconnect();
  }, [width, height, fit]);
  useEffect(() => {
    history.replaceState(null, '', `/themes?${configQuery(config)}`);
    document.title = `${selected.name} · Diana 主题体验`;
    frame.current?.contentWindow?.postMessage({ type: 'diana-theme-config', config }, location.origin);
  }, [config, selected.name]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow
        || event.data?.type !== 'diana-theme-state' || !isConfig(event.data.config)) return;
      setConfig(current => event.data.config.app === current.app ? event.data.config : current);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  // App changes remount the frame; day/night changes are sent in place so a
  // visitor can compare the same scroll position, draft and conversation.
  const frameSrc = useRef('');
  const frameApp = useRef('');
  if (frameApp.current !== config.app) {
    frameApp.current = config.app;
    frameSrc.current = `/theme-app.html?${configQuery(config)}`;
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt('复制此体验链接', location.href); }
  };
  return <main className="theme-gallery">
    <header className="gallery-top">
      <a className="gallery-brand" href="/">DIANA <span> / THEMES</span></a>
      <nav aria-label="演示入口"><a href="/">启动器演示</a><a href="https://lanmengsakura.github.io/diana-codex-theme/" target="_blank" rel="noopener noreferrer">Codex 已有演示 ↗</a><a href="https://github.com/lanmengSakura/diana-multi-app-launcher/releases/tag/v0.1.0-beta.3" target="_blank" rel="noopener noreferrer">下载启动器 ↗</a></nav>
    </header>
    <div className="gallery-controls">
      <div className="app-tabs" role="group" aria-label="选择应用">{apps.map(app => <button key={app.id} aria-pressed={config.app === app.id} onClick={() => setConfig({ ...config, app: app.id, mode: config.mode === 'light' && !app.day ? 'dark' : config.mode })}>{app.short}</button>)}</div>
      <div className="view-controls">
        <div className="mode-tabs" role="group" aria-label="主题配色">
          <button aria-pressed={config.mode === 'dark'} onClick={() => setConfig({ ...config, mode: 'dark' })}>☾ 暗夜</button>
          {selected.day && <button aria-pressed={config.mode === 'light'} onClick={() => setConfig({ ...config, mode: 'light' })}>☼ 日间</button>}
          <button aria-pressed={config.mode === 'original'} onClick={() => setConfig({ ...config, mode: 'original' })}>原版参考</button>
        </div>
        <label className="select-label">场景<select value={config.scene} onChange={event => setConfig({ ...config, scene: event.target.value as DemoConfig['scene'] })}><option value="conversation">{config.app === 'vscode' ? '编辑代码' : config.app === 'terminal' ? '命令示例' : '示例会话'}</option><option value="home">{config.app === 'vscode' ? '欢迎页' : config.app === 'terminal' ? '空白终端' : '起始页'}</option></select></label>
        <label className="select-label">画幅<select value={size} onChange={event => setSize(event.target.value)}><option value="1600">1600 × 960</option><option value="1200">1200 × 820</option></select></label>
        <button className="quiet-control" aria-pressed={!fit} onClick={() => setFit(!fit)}>{fit ? '1:1 查看' : '适应窗口'}</button>
        <button className="quiet-control" onClick={copyLink}>{copied ? '链接已复制' : '分享'}</button>
      </div>
    </div>
    <div className="demo-meta"><div><strong>{selected.name}</strong><span>{selected.subtitle}</span></div><span className="demo-label">网页视觉演示 · 示例数据 · 不操作本机</span></div>
    <section className={`theme-viewport ${fit ? 'fit' : 'actual'}`} ref={viewport} aria-label={`${selected.name} 可点击主题演示`}>
      <div className="frame-size" style={{ width: width * scale, height: height * scale }}>
        <iframe key={config.app} ref={frame} title={`${selected.name} 主题示例，非真实应用`} src={frameSrc.current} style={{ width, height, transform: `scale(${scale})` }} onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'diana-theme-config', config }, location.origin)} sandbox="allow-scripts allow-same-origin" />
      </div>
    </section>
    <footer className="gallery-footer"><p>{selected.note}</p><a href={`https://github.com/lanmengSakura/${selected.repo}`} target="_blank" rel="noopener noreferrer">对应主题仓库 ↗</a><a href={`/theme-app.html?${configQuery(config)}`} target="_blank" rel="noopener noreferrer">单独打开 ↗</a><span>非商业粉丝二创 · 非官方</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Gallery />);
