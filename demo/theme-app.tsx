import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { apps, configQuery, isConfig, parseConfig, type AppId, type DemoConfig, type ThemeMode } from './theme-catalog';
import { applyTheme, art } from './theme-art';
import './theme-app.css';

const initial = parseConfig(location.search);
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
  return <button className="icon-button ui-icon-button" aria-label={label} title={label} onClick={onClick} aria-pressed={active}><Icon name={name}/></button>;
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
  return <>{standalone && <div className="standalone-note"><a href={`/themes?${configQuery(config)}`}>← 返回主题体验 / 切换应用与配色</a><span>网页视觉演示 · 非真实客户端</span></div>}{config.app === 'vscode' ? <VSCodeApp config={config} change={change}/> : config.app === 'terminal' ? <TerminalApp config={config}/> : <ChatApp key={config.app} config={config} change={change}/>}</>;
}
createRoot(document.getElementById('root')!).render(<ThemeApp/>);
