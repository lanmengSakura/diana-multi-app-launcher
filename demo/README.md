# 可点击的高保真演示

## 复用与隔离

`launcher.ts` 先加载 `bridge.ts`，再加载桌面版的 `src/main.tsx`。角色、面板、字形、呼吸外发光、悬停反光、关节展开和音乐粒子均使用同一份源码和素材。桌面版 `index.html` 不导入演示桥；不要把演示桥加入桌面入口。

模拟桥只在当前 iframe 的内存中维护示例状态。唯一网络读取是同源打包音频，不调用本机 API、进程管理器、适配器、文件接口或回环调试端口。父页与 iframe 的消息都校验 origin、source 和消息类型。界面偏好使用本网站的 localStorage，无账号、埋点、统计或数据后台。

- Codex：演示首次确认、挂载、等待完整退出、切换日夜和原版启动。用父页“模拟退出 Codex”推进等待步骤。
- Cursor / VS Code：默认演示公开包标准颜色主题路径，不把 COLOR 伪装成完整美术 MOUNTED。
- Grok Bot：公开包不含本机专用适配器，默认显示拒绝挂载，保留真实能力边界。
- DeepSeek：没有部署时只准备蓝图；不假造服务已启动。
- 所有挂载状态、版本与进程编号都只是模拟，不作为真实兼容性证据。

音符按钮实际播放随构建提供的音频，但默认关闭，不自动播放。演示关闭/最小化会卸载 iframe 并停止音频；重开回到未播放状态。

## 开发与构建

```powershell
npm ci
# 可选：$env:DIANA_HOPEFUL_DREAMER_AUDIO = '你获准使用的 M4A 文件绝对路径'
npm run dev:demo
# http://127.0.0.1:1422/
npm run qa:demo
npm run build:demo
```

QA 只驱动隔离浏览器，不实际启动目标应用。设置 `DEMO_URL` 可以验证静态构建或已发布站点。未提供音频时可以构建无音乐版本；含音乐的完整 QA 需要该媒体。

构建产物在 `site-build/dist/client`；Worker 与配置在 `site-build/dist/server`。原生 `dist` 保持不变。Sites 为避免静态路由绕过响应安全策略，将两份 HTML 暂存为 `.page`，由 Worker 映射到公开地址；用 `node scripts/serve-demo.mjs` 可以本地预览同一映射。若只需普通静态导出，单独执行 `npx vite build --config vite.demo.config.mjs`，不运行打包脚本即可保留标准 HTML 文件。

本仓库 `.openai/hosting.json` 只记录维护者站点 ID，没有凭据。Fork 后若部署到自己的 Sites 项目，需要替换为自己创建的站点 ID，不能向本项目站点发布。发布凭据仅通过短期、单次命令认证使用，不写入源码、Git remote 或构建产物。

托管 Worker 为每个 HTML 响应提供独立的 CSP nonce，允许 Cloudflare 的访问校验脚本运行，仍禁止任意内联脚本。依据 [Cloudflare JavaScript Detections 文档](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/)。本地静态预览保留 meta CSP；用 `node --test scripts/test-demo-worker.mjs` 检查响应策略。
