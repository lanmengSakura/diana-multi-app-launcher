import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { apps, configQuery, framePath, isConfig, parseConfig, type AppId, type DemoConfig, type ThemeMode } from './theme-catalog';
import { applyTheme, art } from './theme-art';
import './theme-app.css';
import './native-layouts.css';
import './native-chats.css';
import harnessFish from './brand/harness-fish.svg';

const initial = parseConfig(location.search);
if (initial.app === 'codex') location.replace(framePath(initial));
applyTheme(initial);
type IconName = 'plus' | 'search' | 'chat' | 'folder' | 'settings' | 'panel' | 'arrow' | 'code' | 'globe' | 'file' | 'branch' | 'check' | 'close' | 'copy' | 'clock';
const iconPaths: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  chat: <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/>,
  folder: <path d="M3 6h7l2 2h9v12H3Z"/>, settings: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>, arrow: <path d="m6 11 6-6 6 6M12 5v15"/>,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20"/>, globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  file: <path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8M8 16h6"/>, branch: <><circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 6v12m0-6h6q6 0 6-4"/></>,
  check: <path d="m4 12 5 5L20 6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
};
function Icon({ name }: { name: IconName }) { return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>; }
function IconButton({ name, label, onClick, active }: { name: IconName; label: string; onClick: () => void; active?: boolean }) {
  return <button type="button" className="icon-button ui-icon-button" aria-label={label} title={label} onClick={onClick} aria-pressed={active}><Icon name={name}/></button>;
}
function WindowControls() { return <div className="window-controls" aria-hidden="true"><span>─</span><span>□</span><span>×</span></div>; }

function ThemeArtwork({ app, enabled }: { app: AppId; enabled: boolean }) {
  if (!enabled) return null;
  if (app === 'cursor') return <div id="diana-cursor-theme-chrome" aria-hidden="true"><div className="diana-cursor-editor-layer">{['corner', 'upper', 'character', 'ornaments', 'doodle'].map(part => <span key={part} className={`diana-cursor-${part}`}/>)}</div></div>;
  if (app === 'grok') return <><div id="diana-grok-theme-underlay" aria-hidden="true"><span className="diana-grok-black-hole"/></div><div id="diana-grok-theme-chrome" aria-hidden="true"><div className="diana-grok-workarea">{['corner', 'upper', 'character', 'ornaments', 'doodle'].map(part => <span key={part} className={`diana-grok-${part}`}/>)}</div></div></>;
  if (app === 'doubao') return <div id="diana-doubao-browser-stage" aria-hidden="true"><span className="diana-doubaowork-corner"/><span className="diana-doubaowork-upper"/><span className="diana-doubaowork-doodle"/><div className="diana-doubaowork-character-cluster"><span className="diana-doubaowork-portrait"/><span className="diana-doubaowork-star diana-doubaowork-star-small"/><span className="diana-doubaowork-star diana-doubaowork-star-large"/><span className="diana-doubaowork-candy"/><span className="diana-doubaowork-lollipop"/><span className="diana-doubaowork-acao diana-doubaowork-acao-heart"/><span className="diana-doubaowork-acao diana-doubaowork-acao-cheer"/></div></div>;
  if (app === 'zcode') return <div id="diana-zcode-chrome" aria-hidden="true"><span className="diana-zcode-corner-line"/><span className="diana-zcode-upper-line"/><span className="diana-zcode-doodle"/><div className="diana-zcode-character-cluster"><span className="diana-zcode-character"/><span className="diana-zcode-star diana-zcode-star-a"/><span className="diana-zcode-star diana-zcode-star-b"/><span className="diana-zcode-candy diana-zcode-candy-wrapped"/><span className="diana-zcode-candy diana-zcode-candy-lollipop"/><span className="diana-zcode-acao diana-zcode-acao-heart"/><span className="diana-zcode-acao diana-zcode-acao-cheer"/></div></div>;
  return null;
}

type Message = { role: 'user' | 'assistant'; text: string; kind?: 'plan' | 'code' | 'result' };
const codingMessages: Message[] = [
  { role: 'user', text: '帮我整理这个小项目的主题配置，让日间和夜间共用一套组件。' },
  { role: 'assistant', text: '先把颜色、布局和交互分开。组件只引用语义变量，切换主题时保留当前内容与滚动位置。', kind: 'plan' },
  { role: 'user', text: '按钮和输入框也要保持统一，别影响已有功能。' },
  { role: 'assistant', text: '可以把页面底色、卡片底色、文字和强调色放在同一个配置里。焦点状态与错误提示继续保留各自的语义。', kind: 'code' },
  { role: 'user', text: '小窗口下装饰不要压住正文。' },
  { role: 'assistant', text: '正文和输入框位于前景，装饰不接收鼠标事件。空间不足时缩减装饰；长会话仍然在自己的区域滚动。' },
  { role: 'user', text: '整理一份我可以对照查看的清单。' },
  { role: 'assistant', text: '可以从日夜配色、按钮状态、文字可读性和窄屏布局开始。这些是本页的预设示例内容，没有读取任何真实项目。', kind: 'result' },
];
const chatMessages: Message[] = [
  { role: 'user', text: '想在周末做一本自己的阅读手账，有没有轻松一点的开始方式？' },
  { role: 'assistant', text: '不用一开始就填满整本。先留一页给正在读的书，再留一页记录今天最想记住的一句话。手账可以是一段阅读的余温，而不是另一项待办。' },
  { role: 'user', text: '我喜欢安静一点的风格，也想留些地方画小图案。' },
  { role: 'assistant', text: '可以试试这样的三栏：左边写书名和日期，中间记两三句感想，右边留白。画一颗星、一片叶子，或者今天杯子里的饮料都很好。', kind: 'plan' },
  { role: 'user', text: '如果今天没有什么特别想写的呢？' },
  { role: 'assistant', text: '那就只记一个词。比如「晴天」「慢慢来」「这一页很好」。空白也可以留下，过几天再回来看看，会发现当时的心情。' },
  { role: 'user', text: '给我一个可以直接照着做的小模板吧。' },
  { role: 'assistant', text: '今天读到：____\n记住的一句话：____\n现在的心情：____\n想画的小东西：____\n\n不用追求完整，留下属于今天的一小块就够了。' },
];
const sampleCode = `export const themes = {\n  dark: { background: '#0d0c0f', accent: '#d86e91' },\n  light: { background: '#fbf8f6', accent: '#b84970' },\n};\n\nexport function setTheme(mode) {\n  document.documentElement.dataset.theme = mode;\n}`;
function Transcript({ messages, app, scrollRef }: { messages: Message[]; app: AppId; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState(-1);
  const copy = async (message: Message, index: number) => {
    try { await navigator.clipboard.writeText(message.text); setCopied(index); window.setTimeout(() => setCopied(-1), 1300); }
    catch { setCopied(-2); }
  };
  return <div className="transcript" ref={scrollRef} tabIndex={0} aria-label="示例会话，可滚动" data-slot={app === 'deepseek' ? 'conversation.view' : undefined}>
    <div className="turns">{messages.map((message, index) => <article className={`turn ${message.role}`} key={index} data-turn={index}>
      {message.role === 'assistant' && <div className="turn-author">{app === 'doubao' ? '豆包' : app === 'grok' ? 'Grok' : app === 'deepseek' ? 'DeepSeek' : 'Agent'}<span>示例</span></div>}
      <div className="turn-text">{message.text}</div>
      {message.kind === 'plan' && <div className="plan-card"><span>思路整理</span><div><Icon name="check"/>先明确用途和阅读顺序</div><div><Icon name="check"/>保留内容，统一表现方式</div><div><Icon name="check"/>让留白与细节保持平衡</div></div>}
      {message.kind === 'code' && <div className="code-card"><header>theme.ts <span>TypeScript</span></header><pre>{sampleCode}</pre></div>}
      {message.kind === 'result' && <div className="result-card"><Icon name="file"/><div>主题整理清单.md<small>示例文件 · 配色 / 焦点 / 布局</small></div></div>}
      {message.role === 'assistant' && <div className="message-actions"><button title="复制示例文字" onClick={() => copy(message, index)}><Icon name={copied === index ? 'check' : 'copy'}/>{copied === index ? '已复制' : ''}</button><span>{copied === -2 ? '浏览器未允许复制，可直接选择文字' : '预设内容'}</span></div>}
    </article>)}</div>
  </div>;
}

function MessageRail({ messages, scrollRef }: { messages: Message[]; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () => {
      const top = scroller.getBoundingClientRect().top + 55;
      const nodes = [...scroller.querySelectorAll<HTMLElement>('[data-turn]')];
      let closest = 0, distance = Infinity;
      nodes.forEach((node, index) => { const next = Math.abs(node.getBoundingClientRect().top - top); if (next < distance) { distance = next; closest = index; } });
      setCurrent(closest);
    };
    scroller.addEventListener('scroll', update, { passive: true }); update();
    return () => scroller.removeEventListener('scroll', update);
  }, [messages, scrollRef]);
  const jump = (index: number) => {
    const host = scrollRef.current, item = host?.querySelector<HTMLElement>(`[data-turn="${index}"]`);
    if (!host || !item) return;
    host.scrollTo({ top: host.scrollTop + item.getBoundingClientRect().top - host.getBoundingClientRect().top - 34, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <nav className="message-rail" aria-label="轮次导航"><i/>{messages.map((message, index) => <button key={index} aria-label={`跳转到第 ${index + 1} 条示例消息`} title={message.text.slice(0, 36)} aria-current={current === index ? 'true' : undefined} onClick={() => jump(index)} style={{ '--mark-width': `${[11, 17, 13, 21, 15][index % 5]}px` } as CSSProperties}><span/></button>)}<i/></nav>;
}

function Composer({ app, onSend }: { app: AppId; onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  const [think, setThink] = useState(false);
  const [search, setSearch] = useState(false);
  const [model, setModel] = useState(app === 'grok' ? 'Grok' : app === 'cursor' ? 'Auto' : app === 'deepseek' ? 'DeepSeek' : '自动');
  const submit = () => { const text = value.trim(); if (!text) return; onSend(text.slice(0, 2000)); setValue(''); };
  return <div className={`composer-wrap composer-${app}`}><form className="composer ui-prompt-input__container" onSubmit={event => { event.preventDefault(); submit(); }}>
    <textarea aria-label="输入示例消息，仅在当前网页显示" placeholder={app === 'cursor' ? 'Plan, @ for context, / for commands' : app === 'grok' ? 'Ask anything' : app === 'deepseek' ? '发送消息，@ 引用文件' : app === 'zcode' ? '描述任务，或 @ 添加上下文' : '发消息或输入 / 选择技能'} value={value} maxLength={2000} rows={app === 'cursor' ? 1 : 2} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}/>
    <div className="composer-tools">
      <div className="composer-left">{app === 'doubao' || app === 'grok' ? <><button type="button" aria-pressed={think} onClick={() => setThink(!think)}>✧ {app === 'grok' ? 'Think' : '深度思考'}</button><button type="button" aria-pressed={search} onClick={() => setSearch(!search)}><Icon name="globe"/>{app === 'grok' ? 'Search' : '联网搜索'}</button></> : <><span className="context-chip"><Icon name="folder"/>theme-playground</span><span className="muted">⌘ /</span></>}</div>
      <label className="model-select"><span className="sr-only">演示模型选项，不连接服务</span><select value={model} onChange={event => setModel(event.target.value)}>{[model, ...['Auto', 'DeepSeek', 'Grok', '自动'].filter(item => item !== model)].map(item => <option key={item}>{item}</option>)}</select></label>
      <button type="submit" className="send-button" disabled={!value.trim()} aria-label="发送到本页演示"><Icon name="arrow"/></button>
    </div>
  </form><div className="composer-foot">{app === 'cursor' || app === 'zcode' ? <><span>⌘ theme-playground</span><span>本地示例</span></> : <span>内容为预设示例，不发送真实模型请求</span>}</div></div>;
}

function Sidebar({ app, collapsed, toggle, current, select, newChat, open }: { app: AppId; collapsed: boolean; toggle: () => void; current: number; select: (index: number) => void; newChat: () => void; open: (name: string) => void }) {
  const meta = apps.find(item => item.id === app)!;
  const coding = ['cursor', 'zcode', 'deepseek'].includes(app);
  const conversations = coding ? ['整理主题配置', '按钮与输入框细节', '检查窄屏布局'] : ['周末的阅读手账', '一杯咖啡的时间', '给自己的小计划'];
  return <aside className={`app-sidebar ui-sidebar ${collapsed ? 'collapsed' : ''}`} data-workspace-sidebar-panel={app === 'zcode' ? 'true' : undefined} data-diana-doubao-sidebar={app === 'doubao' ? 'true' : undefined}>
    <div className="sidebar-brand"><strong>{app === 'doubao' ? '豆包' : app === 'deepseek' ? 'deepseek' : meta.short}</strong><IconButton name="panel" label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggle}/></div>
    <button className="nav-new ui-sidebar-menu-button" onClick={newChat}><Icon name="plus"/><span>{app === 'cursor' ? 'New Chat' : app === 'grok' ? 'New chat' : app === 'zcode' ? '新建任务' : app === 'deepseek' ? '新会话' : '新对话'}</span></button>
    <button className="nav-item ui-sidebar-menu-button" onClick={() => open('搜索示例会话')}><Icon name="search"/><span>{app === 'cursor' || app === 'grok' ? 'Search' : '搜索'}</span><kbd>⌘ K</kbd></button>
    {app === 'cursor' || app === 'zcode' ? <><button className="nav-item" onClick={() => open('自动化')}><Icon name="clock"/><span>{app === 'cursor' ? 'Automations' : '自动化'}</span></button><button className="nav-item" onClick={() => open('技能与自定义')}><Icon name="code"/><span>{app === 'cursor' ? 'Customize' : '技能'}</span></button></> : app === 'doubao' ? <><button className="nav-item" onClick={() => open('写作示例')}><Icon name="file"/><span>帮我写作</span></button><button className="nav-item" onClick={() => open('阅读收藏')}><Icon name="folder"/><span>我的收藏</span></button></> : null}
    <div className="history"><div className="sidebar-section">{app === 'cursor' ? 'Repositories' : coding ? '工作区' : '最近对话'}<span>⌄</span></div>
      {coding && <button className="project-row" onClick={() => open('项目文件')}><Icon name="folder"/><span>theme-playground</span><span>⌄</span></button>}
      {conversations.map((name, index) => <button className="history-item ui-sidebar-menu-button" data-active={current === index} aria-current={current === index ? 'page' : undefined} key={name} onClick={() => select(index)}><span>{coding && <i/>}{name}</span><small>{index === 0 ? '刚刚' : '示例'}</small></button>)}
      {app === 'deepseek' && <button className="project-row secondary-project" onClick={() => open('第二个工作区')}><Icon name="folder"/><span>notes-studio</span><span>⌄</span></button>}
    </div>
    <div className="sidebar-foot"><div className="demo-profile"><span className="avatar">D</span><span>{app === 'cursor' ? 'Demo workspace' : '示例工作区'}</span><IconButton name="settings" label="外观与演示设置" onClick={() => open('外观设置')}/></div></div>
  </aside>;
}

function DialogPanel({ name, close, config, change, select }: { name: string; close: () => void; config: DemoConfig; change: (config: DemoConfig) => void; select: (index: number) => void }) {
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  return <dialog ref={dialog} className="demo-dialog" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}><header><strong>{name}</strong><IconButton name="close" label="关闭面板" onClick={close}/></header>
    {name === '外观设置' ? <><p>切换当前示例的外观。</p><div className="settings-modes">{(['dark', 'light', 'original'] as ThemeMode[]).filter(mode => mode !== 'light' || config.app !== 'terminal').map(mode => <button aria-pressed={config.mode === mode} key={mode} onClick={() => change({ ...config, mode })}>{mode === 'dark' ? '暗夜' : mode === 'light' ? '日间' : '原版参考'}</button>)}</div></> : name.includes('搜索') ? <><input autoFocus placeholder="搜索预设会话" value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索预设会话"/>{['整理主题配置 · 阅读手账', '按钮细节 · 咖啡时间', '窄屏布局 · 小计划'].map((item, index) => item.includes(query) && <button className="search-result" key={item} onClick={() => { select(index); close(); }}><Icon name="chat"/>{item}</button>)}</> : <><p>这是用于查看主题在面板中的表现的示例内容。</p><div className="panel-file"><Icon name="folder"/>theme-playground</div><div className="panel-file"><Icon name="file"/>README.md <span>项目说明</span></div><div className="panel-file"><Icon name="code"/>theme.ts <span>日夜配色</span></div><div className="panel-file"><Icon name="file"/>notes.md <span>界面清单</span></div></>}
    <small>仅当前网页 · 不访问文件、不申请授权、不连接真实服务</small></dialog>;
}

function ChatApp({ config, change }: { config: DemoConfig; change: (config: DemoConfig) => void }) {
  const { app } = config;
  const coding = ['cursor', 'zcode', 'deepseek'].includes(app);
  const samples = coding ? codingMessages : chatMessages;
  const [messages, setMessages] = useState<Message[]>(config.scene === 'home' ? [] : samples);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState(0);
  const [panel, setPanel] = useState('');
  const [details, setDetails] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);
  useEffect(() => { setMessages(config.scene === 'home' ? [] : samples); setSelected(config.scene === 'home' ? -1 : 0); }, [config.scene, samples]);
  useLayoutEffect(() => {
    if (pendingScroll.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    pendingScroll.current = false;
  }, [messages]);
  const select = (index: number) => {
    setSelected(index); setMessages(index === 0 ? samples : samples.slice(index * 2));
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const send = (text: string) => {
    pendingScroll.current = true;
    setMessages(old => [...old, { role: 'user', text }, { role: 'assistant', text: '已在本页展示这条示例消息。你可以继续滚动、切换日夜或查看输入框状态；这里没有发送模型请求，也没有执行任何操作。' }].slice(-24) as Message[]);
  };
  const home = messages.length === 0;
  const sidebar = <Sidebar app={app} collapsed={collapsed} toggle={() => setCollapsed(!collapsed)} current={selected} select={select} newChat={() => { setMessages([]); setSelected(-1); }} open={setPanel}/>;
  return <div className={`application app-${app} ${collapsed ? 'sidebar-collapsed' : ''} ${home ? 'home-scene' : 'chat-scene'}`}>
    {app === 'doubao' ? <div className="browser-chrome"><div className="browser-tabs"><span>豆包</span><span className="browser-add">＋</span><WindowControls/></div><div className="address-row"><span>←</span><span>→</span><span>↻</span><div>⌑ <span>doubao.com/chat/</span></div><span>☆</span><span>⋯</span></div></div> : app === 'cursor' ? <div className="native-title cursor-title"><span className="title-product">Cursor</span><span>File</span><span>Edit</span><span>View</span><span>Help</span><WindowControls/></div> : app === 'zcode' ? <div className="native-title zcode-title"><strong>ZCode</strong><span>←</span><span>→</span><span className="environment">本地工作区</span><WindowControls/></div> : app === 'grok' ? <div className="native-title grok-title"><strong>Grok Bot</strong><span className="native-app-subtitle">Diana · 对话示例</span><WindowControls/></div> : null}
    <div className="application-body">{sidebar}<main className="app-workspace">
      {app !== 'doubao' && <ThemeArtwork app={app} enabled={config.mode !== 'original'}/>}
      <header className="workspace-header"><div>{home ? '' : app === 'cursor' ? 'Theme configuration' : coding ? '整理主题配置' : '周末的阅读手账'}{app === 'grok' && home ? <strong>Grok</strong> : null}</div><div className="workspace-header-actions">{app === 'deepseek' && <button className="quiet-button" aria-pressed={details} onClick={() => setDetails(!details)}><Icon name="panel"/>详情</button>}<IconButton name="plus" label="新建示例会话" onClick={() => { setMessages([]); setSelected(-1); }}/><IconButton name="settings" label="外观设置" onClick={() => setPanel('外观设置')}/></div></header>
      {app === 'cursor' && <aside className="cursor-utilities"><small>On Home</small>{(['Browser', 'Terminal', 'Files'] as const).map((name, index) => <button key={name} onClick={() => setPanel(name)}><Icon name={(['globe', 'code', 'file'] as const)[index]}/>{name}</button>)}</aside>}
      {home ? <div className="welcome"><h1>{app === 'grok' ? 'What can I help with?' : app === 'cursor' ? 'What do you want to build?' : app === 'deepseek' ? '有什么可以帮你？' : app === 'zcode' ? '开始一个新任务' : '今天有什么想聊的？'}</h1><p>{coding ? '从一个想法开始，让灵感慢慢成形。' : '写一点东西，整理一个想法，或者随便聊聊。'}</p>{!['deepseek', 'cursor'].includes(app) && <div className="suggestions">{['整理一个想法', '帮我写一段文字', '从阅读开始'].map((text, index) => <button key={text} onClick={() => select(index)}>{text} ↗</button>)}</div>}</div> : <Transcript app={app} messages={messages} scrollRef={scrollRef}/>}
      <Composer app={app} onSend={send}/>
      {!home && (app === 'zcode' || app === 'deepseek') && <MessageRail messages={messages} scrollRef={scrollRef}/>}
    </main>{details && app === 'deepseek' && <aside className="details-panel"><header>会话详情<IconButton name="close" label="收起详情" onClick={() => setDetails(false)}/></header><label>工作区</label><p>theme-playground</p><label>示例文件</label><div className="panel-file"><Icon name="file"/>theme.ts</div><div className="panel-file"><Icon name="file"/>README.md</div><label>会话内容</label><p>{messages.length} 条本页消息</p><small>仅用于查看详情栏的主题表现</small></aside>}</div>
    {app === 'doubao' && <ThemeArtwork app={app} enabled={config.mode !== 'original'}/>}
    {app === 'deepseek' && config.mode !== 'original' && <div className="harness-overlay" data-shell-overlay="true" aria-hidden="true"/>}
    {panel && <DialogPanel key={panel} name={panel} close={() => setPanel('')} config={config} change={change} select={select}/>}
  </div>;
}

// Layouts reconstructed from the saved native captures, never their private text.
function useNativeConversation(config: DemoConfig, change: (next: DemoConfig) => void, samples: Message[]) {
  const [messages, setMessages] = useState<Message[]>(config.scene === 'home' ? [] : samples);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState('');
  const [panel, setPanel] = useState('');
  const scene = useRef(config.scene);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);
  useEffect(() => {
    if (scene.current !== config.scene) { setMessages(config.scene === 'home' ? [] : samples); scene.current = config.scene; }
  }, [config.scene, samples]);
  useLayoutEffect(() => {
    if (pendingScroll.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    pendingScroll.current = false;
  }, [messages]);
  const moveScene = (next: DemoConfig['scene']) => { scene.current = next; if (next !== config.scene) change({ ...config, scene: next }); };
  const select = (index: number) => { setSelected(index); moveScene('conversation'); setMessages(samples.slice(index % 3 * 2)); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const newChat = () => { moveScene('home'); setMessages([]); setDraft(''); };
  const send = () => {
    if (!draft.trim()) return;
    moveScene('conversation'); pendingScroll.current = true;
    setMessages(old => [...old, { role: 'user', text: draft.trim().slice(0, 2000) }, { role: 'assistant', text: '这条消息仅在当前演示页显示，没有连接模型服务。可以继续查看配色、输入和滚动效果。' }].slice(-24) as Message[]);
    setDraft('');
  };
  return { messages, selected, draft, setDraft, panel, setPanel, scrollRef, select, newChat, send };
}
const grokMessages: Message[] = [
  { role: 'assistant', text: '可以把阅读手账当成一个轻松的小习惯。挑一本正在读的书，从今天最喜欢的一句话开始。' },
  ...chatMessages,
];
function GrokBotApp({ config, change }: { config: DemoConfig; change: (config: DemoConfig) => void }) {
  const chat = useNativeConversation(config, change, grokMessages);
  const [search, setSearch] = useState('');
  const contacts = ['聊天', '阅读手账'];
  return <div className="application app-grok native-grok"><div className="application-body">
    <aside className="grok-contacts">
      <div className="grok-toolbar"><IconButton name="plus" label="新建示例聊天" onClick={chat.newChat}/></div>
      <label className="grok-search"><Icon name="search"/><input aria-label="搜索示例联系人" placeholder="搜索" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="grok-contact-list">{contacts.map((name, index) => name.includes(search) && <button className="grok-contact" key={name} aria-current={chat.selected === index ? 'page' : undefined} onClick={() => chat.select(index)}><span className={`contact-avatar avatar-${index}`}>{index ? '阅' : '聊'}</span><span className="contact-description"><span><strong>{name}</strong><time>{index ? '昨天' : '12:06'}</time></span><small>{index ? '留下今天的一小块心情' : '给我一个阅读手账的小模板'}</small></span></button>)}{search && !contacts.some(name => name.includes(search)) && <p className="grok-no-result">没有匹配的示例联系人</p>}</div>
      <div className="grok-profile"><button onClick={() => chat.setPanel('插件示例')}><Icon name="code"/>插件</button><div><span className="avatar">D</span><span>示例用户</span><IconButton name="settings" label="外观设置" onClick={() => chat.setPanel('外观设置')}/></div></div>
    </aside>
    <main className="app-workspace"><ThemeArtwork app="grok" enabled={config.mode !== 'original'}/>
      <header className="grok-chat-header"><span className="contact-avatar avatar-0">聊</span><strong>{contacts[chat.selected]}</strong><IconButton name="panel" label="聊天资料示例" onClick={() => chat.setPanel('聊天资料示例')}/></header>
      <div className="grok-chat-scroll" ref={chat.scrollRef} tabIndex={0} aria-label="示例聊天记录，可滚动">
        {chat.messages.length > 0 ? <div className="grok-bubbles">{chat.messages.map((message, index) => <article key={index} data-turn={index} className={`grok-message ${message.role}`}>{message.text}</article>)}</div> : <div className="grok-empty">给聊天发一条消息</div>}
      </div>
      <form className="grok-input" onSubmit={event => { event.preventDefault(); chat.send(); }}>
        <IconButton name="plus" label="附件示例，不读取本机" onClick={() => chat.setPanel('附件示例')}/>
        <input aria-label="示例消息，只在本页显示" placeholder={`给${contacts[chat.selected]}发消息`} maxLength={2000} value={chat.draft} onChange={event => chat.setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}/>
        {chat.draft.trim() ? <button className="grok-send" type="submit" aria-label="发送到本页演示"><Icon name="arrow"/></button> : <button className="grok-send" type="button" aria-label="语音按钮，仅展示，不录音" onClick={() => chat.setPanel('语音输入仅作外观演示')}><svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6"/></svg></button>}
      </form>
    </main>
  </div>{chat.panel && <DialogPanel name={chat.panel} close={() => chat.setPanel('')} config={config} change={change} select={chat.select}/>}</div>;
}

function ZCodeApp({ config, change }: { config: DemoConfig; change: (config: DemoConfig) => void }) {
  const chat = useNativeConversation(config, change, codingMessages);
  const [details, setDetails] = useState(true);
  const [model, setModel] = useState('GLM-5.3');
  const [grouped, setGrouped] = useState(true);
  const home = chat.messages.length === 0;
  const projects = ['主题制作', 'Diana Playground', '展示页面', '开源发布'];
  const composer = <form className="z-task-input" onSubmit={event => { event.preventDefault(); chat.send(); }}>
    {home && <button className="z-project-picker" type="button" onClick={() => chat.setPanel('选择示例项目')}><Icon name="folder"/>选择项目 <span>⌄</span></button>}
    <div className="z-input-body"><textarea aria-label="描述示例任务，只在本页显示" rows={2} maxLength={2000} value={chat.draft} onChange={event => chat.setDraft(event.target.value)} placeholder={home ? '向 ZCode 提问，@ 提及文件、文件夹或画板，/ 使用命令或子智能体，$ 使用技能，# 关联对话' : '提出后续修改要求'} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); chat.send(); } }}/>
      <div className="z-input-tools"><IconButton name="plus" label="添加示例上下文" onClick={() => chat.setPanel('示例上下文')}/><button type="button" onClick={() => chat.setPanel('权限文字仅作外观演示')}>{home ? '♧ 变更前确认' : '♧ 完全访问'} <span>⌄</span></button><span className="z-input-spacer"/><span className="z-context-ring" aria-hidden="true"/><label><span className="sr-only">示例模型，不连接服务</span><select value={model} onChange={event => setModel(event.target.value)}><option>GLM-5.3</option><option>Auto</option></select></label><label><span className="sr-only">示例推理强度</span><select defaultValue="最高"><option>最高</option><option>高</option><option>中</option></select></label><button className="z-send" type="submit" disabled={!chat.draft.trim()} aria-label="发送到本页演示"><Icon name="arrow"/></button></div>
    </div>
  </form>;
  return <div className={`application app-zcode native-zcode ${home ? 'z-home' : 'z-conversation'}`}><div className="application-body">
    <aside className="z-project-sidebar" data-workspace-sidebar-panel="true">
      <div className="z-app-toolbar"><strong className="z-app-mark">Z</strong><span aria-hidden="true">←</span><span aria-hidden="true">→</span><button onClick={() => chat.setPanel('版本信息示例')}>更新</button></div>
      <nav className="z-quick-nav"><button onClick={chat.newChat}><Icon name="chat"/>新建任务 <kbd>Ctrl+N</kbd></button><button onClick={() => chat.setPanel('搜索示例会话')}><Icon name="search"/>搜索 <kbd>Ctrl+K</kbd></button><button onClick={() => chat.setPanel('自动化示例')}><Icon name="clock"/>自动化</button><button onClick={() => chat.setPanel('技能示例')}><Icon name="code"/>技能</button></nav>
      <div className="z-project-tabs"><button aria-pressed={!grouped} onClick={() => setGrouped(false)}># 分组</button><button aria-pressed={grouped} onClick={() => setGrouped(true)}><Icon name="folder"/>项目</button><span>⌁</span><IconButton name="panel" label="切换右侧信息栏" onClick={() => setDetails(!details)}/></div>
      <div className="z-project-list"><p>{grouped ? '项目' : '任务'}</p>{projects.map((project, index) => <section key={project}>{grouped && <button className="z-folder" onClick={() => chat.select(index)}><Icon name="folder"/>{project}</button>}<button className="z-project-task" aria-current={!home && chat.selected === index ? 'page' : undefined} onClick={() => chat.select(index)}>{['整理主题配置', '按钮与输入框细节', '检查窄屏布局', '整理发布说明'][index]}<time>{index ? '2天' : '1天'}</time></button>{grouped && <button className="z-project-task" onClick={() => chat.select(index)}>日夜外观对照 <time>3天</time></button>}</section>)}</div>
      <div className="z-account"><span className="avatar">D</span><span>示例用户</span><small>Pro</small><IconButton name="settings" label="外观设置" onClick={() => chat.setPanel('外观设置')}/></div>
    </aside>
    <main className="app-workspace z-main"><ThemeArtwork app="zcode" enabled={config.mode !== 'original'}/>
      <header className="z-workspace-top">{!home && <><strong>整理主题配置</strong><button onClick={() => chat.setPanel('示例项目')}><Icon name="folder"/>theme-playground</button><button onClick={() => chat.setPanel('示例分支')}><Icon name="branch"/>main ⌄</button></>}<div className="z-top-actions"><IconButton name="panel" label={details ? '收起 Git 工具' : '展开 Git 工具'} onClick={() => setDetails(!details)}/><WindowControls/></div></header>
      {home ? <div className="z-start"><div className="z-watermark" aria-hidden="true"><i/><b/></div><h1>有什么想让我帮忙的吗</h1>{composer}<div className="z-template-area"><p><Icon name="globe"/>创建闲时任务，把重复的整理留给明天。</p><div>{['Git 站会摘要', 'CI 失败与不稳定测试报告', '自定义'].map((name, index) => <button key={name} onClick={() => chat.setDraft(['整理这个项目一周内的重要变更。', '列出需要关注的测试与排查顺序。', ''][index])}><strong><Icon name="clock"/>{name}</strong><span>{['每周五总结这一周发生的事情。', '汇总近期的测试状态，并整理排查方向。', '跳过模板，直接告诉它你想做什么。'][index]}</span></button>)}</div></div></div> : <div className={`z-session ${details ? 'with-details' : ''}`}>
        <section className="z-thread"><div className="z-messages" ref={chat.scrollRef} tabIndex={0} aria-label="示例任务记录，可滚动">{chat.messages.map((message, index) => <article key={index} data-turn={index} className={`z-message ${message.role}`}>{message.role === 'assistant' && <div className="z-elapsed">已工作 {index * 3 + 7} 秒 <span>›</span></div>}<p>{message.text}</p>{message.kind === 'code' && <pre>{sampleCode}</pre>}{message.role === 'assistant' && <details className="z-change-card"><summary>›　1 个文件已更改 <b>+8</b> <i>−2</i><span>示例变更</span></summary><pre>{sampleCode}</pre></details>}</article>)}</div><MessageRail messages={chat.messages} scrollRef={chat.scrollRef}/>{composer}</section>
        {details && <aside className="z-git-tools"><header>Git 工具 <IconButton name="close" label="收起 Git 工具" onClick={() => setDetails(false)}/></header><button onClick={() => chat.setPanel('示例变更')}><Icon name="file"/>更改 <b>+32</b><i>−8</i></button><button onClick={() => chat.setPanel('示例分支')}><Icon name="branch"/>main ⌄</button><button onClick={() => chat.setPanel('提交功能仅作演示')}>⌁ 提交或推送</button><hr/><p>进程 <b>4/4</b></p>{['梳理日夜颜色变量', '保留按钮与输入状态', '确认装饰避让正文', '整理视觉对照清单'].map(text => <div className="z-done" key={text}><Icon name="check"/><s>{text}</s></div>)}<hr/><p>智能体</p></aside>}
      </div>}
    </main>
  </div>{chat.panel && <DialogPanel name={chat.panel} close={() => chat.setPanel('')} config={config} change={change} select={chat.select}/>}</div>;
}

// Three distinct native shells share only local demo state and approved artwork.
type SavedChat = ReturnType<typeof useNativeConversation>;
const savedTitles = ['整理主题配置', '按钮与输入框细节', '检查窄屏布局'];
const doubaoTitles = ['周末的阅读手账', '一杯咖啡的时间', '给自己的小计划'];
function Microphone() {
  // Same existing microphone icon as the Grok demo, not a new illustration.
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6"/></svg>;
}
function SavedCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" aria-label={copied ? '已复制示例内容' : '复制示例内容'} title={copied ? '已复制' : '复制'} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }}><Icon name={copied ? 'check' : 'copy'}/></button>;
}
function SavedAnswer({ message }: { message: Message }) {
  return <><p>{message.text}</p>{message.kind === 'plan' && <ul><li>把颜色整理为日间、暗夜两组变量。</li><li>保留原生按钮、输入框和滚动区域。</li><li>让装饰停留在阅读区以外的留白中。</li></ul>}{message.kind === 'code' && <div className="saved-code"><header><Icon name="file"/>theme.ts <span>示例代码</span></header><pre><HighlightCode text={sampleCode}/></pre></div>}</>;
}
function SavedChatSidebar({ app, chat, collapsed, toggle, themed, start }: { app: AppId; chat: SavedChat; collapsed: boolean; toggle: () => void; themed: boolean; start: (work?: boolean) => void }) {
  const titles = app === 'doubao' ? doubaoTitles : savedTitles;
  const home = chat.messages.length === 0;
  const selectRow = (title: string, index: number) => <button key={title} className="saved-history-row" aria-current={!home && chat.selected === index ? 'page' : undefined} onClick={() => chat.select(index)}><span>{title}</span><small>{index ? '昨天' : '刚刚'}</small></button>;
  if (app === 'doubao') return <aside className={`db-sidebar saved-sidebar ${collapsed ? 'is-collapsed' : ''}`} data-diana-doubao-sidebar="true">
    {themed && <span className="diana-doubaowork-doodle db-sidebar-doodle" aria-hidden="true"/>}
    <div className="db-brand"><span>豆包</span><IconButton name="search" label="搜索示例会话" onClick={() => chat.setPanel('搜索示例会话')}/><IconButton name="panel" label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggle}/></div>
    <nav className="db-nav">{(['新工作任务', '新对话', '定时任务', '技能 · 连接器 · 伙伴', '云盘', 'API 服务', '更多'] as const).map((name, index) => <button key={name} title={name} onClick={() => index === 0 || index === 1 ? start(index === 0) : chat.setPanel(`${name} · 外观示例`)}><Icon name={(['file', 'chat', 'clock', 'code', 'folder', 'globe', 'panel'] as const)[index]}/><span>{name}</span>{index > 4 && <small>›</small>}</button>)}</nav>
    <div className="db-history saved-history"><p>置顶</p>{titles.map(selectRow)}<p>项目</p><button className="db-create-project" onClick={() => chat.setPanel('创建项目 · 仅展示')}><Icon name="plus"/>创建新项目</button><p>最近</p>{['阅读记录的小模板', '今天想写的一句话', '做一本自己的手账'].map(selectRow)}</div>
    <footer className="db-profile"><span className="avatar">D</span><div>示例用户<small>网页演示</small></div><IconButton name="settings" label="外观设置" onClick={() => chat.setPanel('外观设置')}/></footer>
  </aside>;
  if (app === 'cursor') return <aside className={`cu-sidebar saved-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="cu-sidebar-top"><IconButton name="panel" label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggle}/><div aria-hidden="true">←　→</div></div>
    <nav className="cu-nav">{(['New Chat', 'Search', 'Automations', 'Customize'] as const).map((name, index) => <button title={name} key={name} onClick={() => index === 0 ? chat.newChat() : chat.setPanel(index === 1 ? '搜索示例会话' : `${name} · 示例`)}><Icon name={(['chat', 'search', 'clock', 'code'] as const)[index]}/><span>{name}</span></button>)}</nav>
    <div className="cu-history saved-history"><header><span>Repositories</span><IconButton name="folder" label="示例项目" onClick={() => chat.setPanel('示例项目')}/></header><button className="cu-repository" onClick={() => chat.setPanel('示例项目')}><Icon name="folder"/>theme-playground</button>{titles.map(selectRow)}</div>
    <footer className="cu-profile"><div className="cu-onboarding"><div>Getting Started <span>2/3</span></div><button onClick={() => chat.setPanel('Connect Slack · 仅展示，不连接账号')}><Icon name="plus"/>Connect Slack</button></div><div className="cu-account"><span className="avatar">D</span><span>Demo workspace</span><IconButton name="settings" label="外观设置" onClick={() => chat.setPanel('外观设置')}/></div></footer>
  </aside>;
  return <aside className={`ds-sidebar saved-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="ds-brand"><span className="harness-fish" style={{ maskImage: `url("${harnessFish}")` }} aria-hidden="true"/><strong>DSH 本地构建</strong><IconButton name="panel" label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggle}/></div>
    <button className="ds-new" title="新会话" onClick={chat.newChat}><Icon name="plus"/><span>新会话</span></button>
    <div className="ds-workspace-tools"><span>工作区</span><IconButton name="search" label="搜索示例会话" onClick={() => chat.setPanel('搜索示例会话')}/><IconButton name="settings" label="工作区筛选示例" onClick={() => chat.setPanel('工作区筛选示例')}/><IconButton name="folder" label="添加工作区示例" onClick={() => chat.setPanel('添加工作区示例')}/></div>
    <div className="ds-history saved-history"><button className="ds-project" onClick={() => chat.setPanel('示例工作区')}><Icon name="folder"/>Diana Theme Playground</button>{titles.map(selectRow)}<button className="ds-more" onClick={() => chat.select(0)}>展示全部示例会话</button></div>
    <button className="ds-settings" title="设置" onClick={() => chat.setPanel('外观设置')}><Icon name="settings"/><span>设置</span></button>
  </aside>;
}
function SavedComposer({ app, chat, workMode }: { app: AppId; chat: SavedChat; workMode: boolean }) {
  const [model, setModel] = useState(app === 'cursor' ? 'Cursor Grok 4.6 Medium' : app === 'deepseek' ? 'DeepSeek-V4-Flash High' : '豆包·快速');
  const [permission, setPermission] = useState('Workspace Write');
  const field = <textarea aria-label="输入示例消息，仅在当前网页显示" rows={app === 'cursor' ? 1 : 2} maxLength={2000} value={chat.draft} onChange={event => chat.setDraft(event.target.value)} placeholder={app === 'cursor' ? 'Send follow-up' : app === 'deepseek' ? '发消息或做任务、/ 调用指令 @ 文件或对话' : workMode ? '描述你的工作任务…' : '发消息或按住空格说话…'} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); chat.send(); } }}/>
  const modelPicker = <label className="saved-model"><span className="sr-only">示例模型，不连接服务</span><select value={model} onChange={event => setModel(event.target.value)}>{[app === 'cursor' ? 'Cursor Grok 4.6 Medium' : app === 'deepseek' ? 'DeepSeek-V4-Flash High' : '豆包·快速', 'Auto'].map(name => <option key={name}>{name}</option>)}</select></label>;
  const sendOrVoice = chat.draft.trim() ? <button className="saved-send" type="submit" aria-label="发送到本页演示"><Icon name="arrow"/></button> : <button className="saved-voice" type="button" aria-label="语音输入外观示例，不录音" onClick={() => chat.setPanel('语音输入仅作外观演示')}><Microphone/></button>;
  if (app === 'cursor') return <div className="cu-compose-area"><form className="cu-composer" onSubmit={event => { event.preventDefault(); chat.send(); }}><IconButton name="plus" label="添加上下文示例" onClick={() => chat.setPanel('添加上下文示例')}/>{field}{modelPicker}{sendOrVoice}</form><div className="cu-location"><button onClick={() => chat.setPanel('This PC · 不访问本机')}><Icon name="code"/>This PC <span>⌄</span></button><span title="网页示例，不消耗模型额度">本页演示</span></div></div>;
  if (app === 'doubao') return <div className="db-compose-area"><form className="db-composer" onSubmit={event => { event.preventDefault(); chat.send(); }}>{field}<div className="db-compose-tools"><IconButton name="plus" label="添加附件示例，不读取本机" onClick={() => chat.setPanel('附件示例')}/><div className="db-compose-shortcuts"><button type="button" onClick={() => chat.setPanel('对话模式 · 示例')}><Icon name="chat"/>{workMode ? '工作' : '对话'} <span>›</span></button>{['帮我写作', '图像生成', '视频生成', '解题答疑', '音乐生成', 'AI 播客', '更多'].map((name, index) => <button key={name} type="button" onClick={() => chat.setDraft(['帮我写一个阅读手账的开头。', '描述一幅安静的周末插画。', '整理一段手账视频的分镜。', '帮我理清这个问题的思路。', '描述一段适合阅读的背景音乐。', '把读书笔记整理成播客提纲。', ''][index])}><Icon name={(['file', 'file', 'panel', 'search', 'code', 'globe', 'panel'] as const)[index]}/>{name}</button>)}</div>{modelPicker}{sendOrVoice}</div></form></div>;
  return <div className="ds-compose-area"><form className="ds-composer" onSubmit={event => { event.preventDefault(); chat.send(); }}>{field}<div className="ds-compose-tools"><IconButton name="plus" label="引用文件示例，不读取本机" onClick={() => chat.setPanel('引用文件示例')}/><label className="ds-permission"><Icon name="folder"/><span className="sr-only">示例权限，不改变本机权限</span><select value={permission} onChange={event => setPermission(event.target.value)}><option>Workspace Write</option><option>Read Only</option></select></label><span className="saved-spacer"/>{modelPicker}<span className="ds-context-ring" title="上下文占用仅作外观展示"/><button className="saved-send" type="submit" disabled={!chat.draft.trim()} aria-label="发送到本页演示"><Icon name="arrow"/></button></div></form><div className="ds-usage" title="仅演示字段；没有真实模型请求，不产生 token 用量"><span>{chat.messages.filter(message => message.role === 'user').length} 轮 · {chat.messages.filter(message => message.role === 'assistant').length} 步</span><span>LLM — 秒</span><span>首 token — 秒 · — tok/s</span><span>缓存命中 —%</span><span>输入 — tok · 输出 — tok</span><small>示例</small></div></div>;
}
function SavedTranscript({ app, chat, trajectory }: { app: AppId; chat: SavedChat; trajectory: boolean }) {
  return <div className={`saved-chat-scroll ${app === 'cursor' ? 'cu-scroll' : app === 'doubao' ? 'db-scroll' : 'ds-scroll'}`} ref={chat.scrollRef} tabIndex={0} aria-label="示例会话，可滚动" data-slot={app === 'deepseek' ? 'conversation.view' : undefined}>
    <div className="saved-turns">{app === 'deepseek' && <details className="ds-system-prompt"><summary><Icon name="file"/>系统提示词</summary><p>这是静态主题体验。消息、项目和轨迹均为本页示例，不访问真实文件或模型。</p></details>}
      {chat.messages.map((message, index) => <article key={index} data-turn={index} className={`saved-message ${message.role} ${trajectory ? 'is-trajectory' : ''}`}>
        {trajectory ? <><div className="ds-trace-heading"><span>{String(index + 1).padStart(2, '0')}</span><Icon name={message.role === 'user' ? 'chat' : 'check'}/><strong>{message.role === 'user' ? '用户消息' : '回复内容'}</strong><small>本页示例</small></div><details open={index < 2}><summary>查看内容</summary><SavedAnswer message={message}/></details></> : <>
          {message.role === 'assistant' && app !== 'doubao' && <details className="saved-reasoning"><summary>{app === 'cursor' ? 'Thought' : '已思考'} <span>›</span></summary><p>先整理配色和布局，再检查文字与装饰的关系。这段内容是预设思路示例。</p></details>}
          <SavedAnswer message={message}/>
          {message.role === 'assistant' && <>{app === 'deepseek' && <button className="ds-turn-usage" onClick={() => chat.setPanel('Session 日志')}><Icon name="file"/>本轮用量 <span>· — tok</span></button>}<div className="saved-message-actions"><SavedCopy text={message.text}/><button title="有帮助 · 本页示例" aria-label="有帮助 · 本页示例" onClick={() => chat.setPanel('反馈仅作演示，不会提交')}><Icon name="check"/></button><button title="分支示例" aria-label="查看分支示例" onClick={() => chat.setPanel('分支示例')}><Icon name="branch"/></button>{app === 'cursor' && <time>Just now</time>}</div></>}
          {message.role === 'user' && app === 'deepseek' && <div className="ds-user-actions"><SavedCopy text={message.text}/></div>}
        </>}
      </article>)}
    </div>
  </div>;
}
function SavedSessionLog({ chat }: { chat: SavedChat }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => chat.setPanel('');
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  return <dialog ref={dialog} className="saved-session-log demo-dialog" aria-labelledby="session-log-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}><header><strong id="session-log-title">Session 日志</strong><IconButton name="close" label="关闭日志" onClick={close}/></header><p>本页交互记录，不是客户端运行日志。</p><div>{chat.messages.map((message, index) => <p key={index}><code>{String(index + 1).padStart(2, '0')} {message.role}</code><span>{message.text}</span></p>)}</div><small>模型请求：无　文件访问：无　真实用量：无</small></dialog>;
}
function SavedChatApp({ config, change }: { config: DemoConfig; change: (next: DemoConfig) => void }) {
  const app = config.app;
  const chat = useNativeConversation(config, change, app === 'doubao' ? chatMessages : codingMessages);
  const [collapsed, setCollapsed] = useState(false);
  const [workMode, setWorkMode] = useState(false);
  const [view, setView] = useState<'conversation' | 'trajectory'>('conversation');
  const home = chat.messages.length === 0;
  const themed = config.mode !== 'original';
  const toggle = () => setCollapsed(value => !value);
  const composer = <SavedComposer app={app} chat={chat} workMode={workMode}/>;
  return <div className={`application app-${app} native-chat native-${app} ${collapsed ? 'sidebar-collapsed' : ''} ${home ? 'saved-home' : 'saved-conversation'}`}>
    {app === 'doubao' && <div className="browser-chrome"><div className="browser-tabs"><span>豆包</span><span className="browser-add">＋</span><WindowControls/></div><div className="address-row"><span>←</span><span>→</span><span>↻</span><div>doubao.com</div><span>☆</span><span>⋯</span></div></div>}
    {app === 'cursor' && <div className="native-title cursor-title"><span>Cursor</span><span>File</span><span>Edit</span><span>View</span><span>Help</span><WindowControls/></div>}
    <div className="application-body"><SavedChatSidebar app={app} chat={chat} collapsed={collapsed} toggle={toggle} themed={themed} start={work => { setWorkMode(Boolean(work)); chat.newChat(); }}/><main className="app-workspace">
      {app === 'cursor' && <ThemeArtwork app={app} enabled={themed}/>}
      {app === 'doubao' ? <header className="db-header"><IconButton name="panel" label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={toggle}/><span>{home ? '' : doubaoTitles[chat.selected % 3]}</span><IconButton name="settings" label="外观设置" onClick={() => chat.setPanel('外观设置')}/><button aria-label="更多会话选项" onClick={() => chat.setPanel('会话选项示例')}>⋯</button></header> : app === 'cursor' ? <header className="cu-header"><span>{home ? 'New Chat' : 'Theme configuration'}</span><Icon name="code"/><div><button onClick={() => chat.setPanel('IDE 入口仅作外观演示')}>IDE ↗</button><button aria-label="更多会话选项" onClick={() => chat.setPanel('会话选项示例')}>⋯</button><IconButton name="panel" label="工具面板示例" onClick={() => chat.setPanel('工具面板示例')}/></div></header> : <header className="ds-header"><div><strong>{home ? '新会话' : savedTitles[chat.selected % 3]}</strong><button onClick={() => chat.setPanel('标准模式 · 示例')}><Icon name="branch"/>标准模式</button><button className="ds-session-log" onClick={() => chat.setPanel('Session 日志')}>Session 日志 ↓</button></div><nav aria-label="会话视图"><button aria-pressed={view === 'conversation'} onClick={() => setView('conversation')}>对话</button><button aria-pressed={view === 'trajectory'} onClick={() => setView('trajectory')}>轨迹</button></nav></header>}
      {app === 'cursor' && <aside className="cu-utilities"><small>On Home</small>{(['Browser', 'Terminal', 'Files'] as const).map((name, index) => <button key={name} onClick={() => chat.setPanel(`${name} · 示例`)}><Icon name={(['globe', 'code', 'file'] as const)[index]}/>{name}</button>)}</aside>}
      {home ? app === 'doubao' ? <div className="db-home"><div className="db-greeting"><h1>有什么我能帮你的吗?</h1><div className="db-work-switch"><button aria-pressed={!workMode} onClick={() => setWorkMode(false)}>对话</button><button aria-pressed={workMode} onClick={() => setWorkMode(true)}>工作</button></div></div><div className="db-recommendations"><p>为你推荐</p>{['如何开始一本阅读手账？', '整理一份轻松的周末计划', '帮我写一个读书笔记模板', '留下今天最想记住的一句话'].map(text => <button key={text} onClick={() => chat.setDraft(text)}>{text}</button>)}</div></div> : <div className={`saved-empty ${app === 'cursor' ? 'cu-empty' : 'ds-empty'}`}><h1>{app === 'cursor' ? 'What do you want to build?' : '有什么可以帮你？'}</h1><p>{app === 'cursor' ? 'Start a conversation in this workspace.' : '选择工作区，开始一个新会话。'}</p></div> : <SavedTranscript app={app} chat={chat} trajectory={app === 'deepseek' && view === 'trajectory'}/>}
      {composer}
      {app === 'deepseek' && !home && view === 'conversation' && <MessageRail messages={chat.messages} scrollRef={chat.scrollRef}/>}
    </main></div>
    {app === 'doubao' && <ThemeArtwork app={app} enabled={themed}/>}
    {app === 'deepseek' && themed && <div className="harness-overlay" data-shell-overlay="true" aria-hidden="true"/>}
    {chat.panel === 'Session 日志' ? <SavedSessionLog chat={chat}/> : chat.panel && <DialogPanel name={chat.panel} close={() => chat.setPanel('')} config={config} change={change} select={chat.select}/>}
  </div>;
}

const codeFiles: Record<string, string> = {
  'theme.ts': `// Diana — one component system, two palettes\n\nexport type ThemeMode = 'dark' | 'light';\n\nexport const themes = {\n  dark: {\n    background: '#0d0c0f',\n    surface: '#171419',\n    foreground: '#f3eef0',\n    accent: '#d86e91',\n  },\n  light: {\n    background: '#fbf8f6',\n    surface: '#ffffff',\n    foreground: '#2c2529',\n    accent: '#b84970',\n  },\n};\n\nexport function applyTheme(mode: ThemeMode) {\n  const palette = themes[mode];\n  const root = document.documentElement;\n\n  root.dataset.theme = mode;\n  Object.entries(palette).forEach(([key, color]) => {\n    root.style.setProperty('--' + key, color);\n  });\n}\n\n// Keep artwork below the reading and input layers.\n// Decorative elements never receive pointer events.`,
  'App.tsx': `import { useState } from 'react';\nimport { applyTheme, type ThemeMode } from './theme';\nimport './styles.css';\n\nexport function App() {\n  const [mode, setMode] = useState<ThemeMode>('dark');\n\n  function toggleTheme() {\n    const next = mode === 'dark' ? 'light' : 'dark';\n    applyTheme(next);\n    setMode(next);\n  }\n\n  return (\n    <main className="workspace">\n      <h1>A little space for your ideas.</h1>\n      <button onClick={toggleTheme}>\n        {mode === 'dark' ? '日间' : '暗夜'}\n      </button>\n    </main>\n  );\n}`,
  'styles.css': `:root {\n  color-scheme: dark light;\n  font-family: 'Segoe UI', sans-serif;\n}\n\n.workspace {\n  min-height: 100vh;\n  color: var(--foreground);\n  background: var(--background);\n}\n\nbutton {\n  border: 1px solid var(--accent);\n  background: var(--surface);\n  color: var(--foreground);\n  border-radius: 8px;\n}\n\nbutton:focus-visible {\n  outline: 2px solid var(--accent);\n  outline-offset: 3px;\n}`,
  'README.md': `# Theme Playground\n\nA small fictional project for the Diana theme demo.\n\n## Explore\n\n- Switch between light and dark palettes.\n- Open another file in the explorer.\n- Toggle the terminal panel.\n- Compare the unthemed reference.\n\n## Privacy\n\nAll files shown here are prewritten examples.\nThis page cannot read or modify your local workspace.`,
};
function HighlightCode({ text }: { text: string }) {
  return <>{text.split(/(\/\/[^\n]*|'[^']*'|"[^"]*"|\b(?:export|const|function|type|return|import|from|if)\b)/g).map((token, index) => <span key={index} className={token.startsWith('//') ? 'token-comment' : /^['"]/.test(token) ? 'token-string' : /^(export|const|function|type|return|import|from|if)$/.test(token) ? 'token-keyword' : undefined}>{token}</span>)}</>;
}
function VSCodeApp({ config, change }: { config: DemoConfig; change: (config: DemoConfig) => void }) {
  const [file, setFile] = useState('theme.ts');
  const [showTerminal, setShowTerminal] = useState(true);
  const [showExplorer, setShowExplorer] = useState(true);
  const [panel, setPanel] = useState('');
  const [query, setQuery] = useState('');
  const [activeBar, setActiveBar] = useState('explorer');
  const themed = config.mode !== 'original';
  return <div className={`application app-vscode monaco-workbench ${config.mode === 'light' ? 'vs' : 'vs-dark'} ${themed ? 'diana-vscode-theme-themes-diana-demo' : ''}`}>
    <div className="native-title vscode-title"><strong>Code</strong><span>File</span><span>Edit</span><span>Selection</span><span>View</span><button onClick={() => setShowTerminal(!showTerminal)}>Terminal</button><div className="vscode-title-search"><Icon name="search"/>theme-playground</div><WindowControls/></div>
    <div className="vscode-body"><aside className="activity-bar"><IconButton name="file" label="资源管理器" active={activeBar === 'explorer' && showExplorer} onClick={() => { setActiveBar('explorer'); setShowExplorer(activeBar === 'explorer' ? !showExplorer : true); }}/><IconButton name="search" label="搜索示例文件" active={activeBar === 'search'} onClick={() => { setActiveBar('search'); setShowExplorer(true); }}/><IconButton name="branch" label="源代码管理示例" active={activeBar === 'git'} onClick={() => { setActiveBar('git'); setShowExplorer(true); }}/><div className="activity-bottom"><IconButton name="settings" label="外观设置" onClick={() => setPanel('外观设置')}/></div></aside>
      {showExplorer && <aside className="part sidebar vscode-explorer"><header>{activeBar === 'explorer' ? 'EXPLORER' : activeBar === 'search' ? 'SEARCH' : 'SOURCE CONTROL'}</header>{activeBar === 'search' && <input aria-label="搜索示例文件" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search files"/>}<div className="tree-heading">⌄ THEME-PLAYGROUND</div>{activeBar === 'git' ? <div className="empty-git">示例工作区<br/><small>没有待提交的更改</small></div> : <><div className="tree-heading tree-src">⌄ src</div>{Object.keys(codeFiles).filter(name => name.toLowerCase().includes(query.toLowerCase())).map(name => <button className="tree-file" key={name} aria-current={file === name ? 'page' : undefined} onClick={() => setFile(name)}><span className={name.endsWith('.ts') || name.endsWith('.tsx') ? 'ts-file' : 'css-file'}>{name.endsWith('.md') ? 'M↓' : name.endsWith('.css') ? '#' : 'TS'}</span>{name}</button>)}</>}</aside>}
      <main className="part editor vscode-editor"><div className="editor-tabs">{['theme.ts', 'App.tsx', 'README.md'].map(name => <button aria-pressed={file === name} key={name} onClick={() => setFile(name)}>{name}<span>×</span></button>)}</div>
        {config.scene === 'home' ? <div className="vscode-welcome"><h1>Visual Studio Code</h1><p>Editing evolved</p><h2>Start</h2><button onClick={() => change({ ...config, scene: 'conversation' })}>打开示例项目…</button><h2>Recent</h2><button onClick={() => change({ ...config, scene: 'conversation' })}>theme-playground <small>本页示例</small></button></div> : <><div className="breadcrumbs">src › {file} › <span>themes</span></div><div className="code-scroll" tabIndex={0} aria-label={`${file} 示例代码，可滚动`}><div className="code-lines">{codeFiles[file].split('\n').map((line, index) => <div className="code-line" key={index}><span className="line-number">{index + 1}</span><code><HighlightCode text={line || ' '}/></code></div>)}</div><div className="minimap" aria-hidden="true">{codeFiles[file].split('\n').map((line, index) => <span key={index} style={{ width: `${Math.min(line.length, 45) * 1.6}px`, opacity: line ? .28 : 0 }}/>)}</div></div></>}
        {showTerminal && <section className="vscode-terminal"><header><span>PROBLEMS</span><span>OUTPUT</span><button aria-pressed="true" onClick={() => setShowTerminal(true)}>TERMINAL</button><IconButton name="close" label="隐藏终端面板" onClick={() => setShowTerminal(false)}/></header><pre><span className="terminal-green">PS</span> C:\Demo\theme-playground&gt; npm run dev{'\n\n'}  <span className="terminal-green">VITE</span>  ready — 示例输出{'\n\n'}  页面未启动任何本机服务。</pre></section>}
      </main></div>
    <footer className="vscode-status"><span>⑂ main</span><span>ⓧ 0　⚠ 0</span><span className="status-spacer"/><span>Ln 1, Col 1</span><span>Spaces: 2</span><span>UTF-8</span><span>TypeScript</span><button onClick={() => setShowTerminal(!showTerminal)}>终端 {showTerminal ? '▾' : '▴'}</button></footer>
    {panel && <DialogPanel name={panel} close={() => setPanel('')} config={config} change={change} select={() => setFile('theme.ts')}/>}
  </div>;
}

function TerminalApp({ config }: { config: DemoConfig }) {
  const [shell, setShell] = useState<'powershell' | 'cmd'>('powershell');
  const [value, setValue] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => { setLines(config.scene === 'home' ? [] : ['Diana Theme Playground', '', 'PS C:\\Demo> Get-ChildItem', '', '    Directory: C:\\Demo', '', 'Mode       Name', '----       ----', 'd----      theme-playground', '-a---      README.md', '-a---      notes.md', '', '提示：输入 help 查看本页可体验的示例命令。']); }, [config.scene, shell]);
  useLayoutEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [lines]);
  const run = () => {
    const command = value.trim(); setValue('');
    if (command === 'clear' || command === 'cls') { setLines([]); return; }
    const result = command === 'help' ? ['网页示例命令：help / dir / Get-ChildItem / echo 文字 / clear / cls', '命令仅匹配预设文本，不连接 Shell、不访问文件。']
      : /^(dir|get-childitem)$/i.test(command) ? ['theme-playground/', 'README.md', 'notes.md']
      : /^echo\s/i.test(command) ? [command.slice(5)] : command ? ['这是网页主题演示，不执行真实命令。输入 help 查看示例。'] : [];
    setLines(old => [...old, `${shell === 'powershell' ? 'PS ' : ''}C:\\Demo> ${command}`, ...result, ''].slice(-100));
  };
  return <div className="application app-terminal"><div className="terminal-tabs">{(['powershell', 'cmd'] as const).map(name => <button key={name} aria-pressed={shell === name} onClick={() => setShell(name)}><span>{name === 'powershell' ? '›_' : 'C:\\'}</span>{config.mode === 'original' ? '' : 'Diana '}{name === 'powershell' ? 'PowerShell' : 'CMD'}</button>)}<span className="terminal-tab-note">网页命令示例</span><WindowControls/></div>
    <div className="terminal-canvas" style={{ backgroundImage: config.mode === 'original' ? 'none' : `url("${art.terminal}")` }} ref={output}>
      <pre className="terminal-output">{shell === 'cmd' ? 'Microsoft Windows [Demo]\n\n' : 'Windows PowerShell\n\n'}{lines.map((line, index) => <span key={index} className={line.includes('Diana') ? 'terminal-rose' : line.startsWith('d----') ? 'terminal-blue' : undefined}>{shell === 'cmd' ? line.replace(/^PS /, '').replace('Get-ChildItem', 'dir') : line}{'\n'}</span>)}</pre>
      <form className="terminal-command" onSubmit={event => { event.preventDefault(); run(); }}><label htmlFor="command">{shell === 'powershell' ? 'PS ' : ''}C:\Demo&gt; </label><input id="command" spellCheck={false} autoComplete="off" value={value} maxLength={1000} onChange={event => setValue(event.target.value)} aria-label="终端示例命令，不执行系统命令"/></form>
    </div>
  </div>;
}

function ThemeApp() {
  const [config, setConfig] = useState(initial);
  const change = (next: DemoConfig) => {
    const clean = next.app === 'terminal' && next.mode === 'light' ? { ...next, mode: 'dark' as const } : next;
    setConfig(clean);
    if (window.parent !== window) window.parent.postMessage({ type: 'diana-theme-state', config: clean }, location.origin);
  };
  useLayoutEffect(() => { applyTheme(config); document.title = `${apps.find(app => app.id === config.app)!.name} · Diana 视觉示例`; }, [config]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'diana-theme-config' || !isConfig(event.data.config)) return;
      setConfig(event.data.config);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, []);
  const standalone = window.parent === window;
  return <>{standalone && <div className="standalone-note"><a href={`/themes?${configQuery(config)}`}>← 返回主题体验 / 切换应用与配色</a><span>网页视觉演示 · 非真实客户端</span></div>}{config.app === 'grok' ? <GrokBotApp config={config} change={change}/> : config.app === 'zcode' ? <ZCodeApp config={config} change={change}/> : config.app === 'vscode' ? <VSCodeApp config={config} change={change}/> : config.app === 'terminal' ? <TerminalApp config={config}/> : ['doubao', 'cursor', 'deepseek'].includes(config.app) ? <SavedChatApp key={config.app} config={config} change={change}/> : <ChatApp key={config.app} config={config} change={change}/>}</>;
}
createRoot(document.getElementById('root')!).render(<ThemeApp/>);
