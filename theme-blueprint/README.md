# ZCode 主题安全蓝图

这里保存两个可复用部分：

1. `zcode-tokens.css`：基于 ZCode 3.6.5 原生 `theme-zai-dark` / `theme-zai-light` 变量制作的 Diana 日夜配色映射。
2. `zcode-artwork-contract.css`：只描述装饰层自身，不绑定任何带构建哈希的生产选择器。

## 已确认

- ZCode 会在根节点切换 `theme-zai-dark` 和 `theme-zai-light`。
- 原生主题状态存放在 `localStorage` 的 `zcode-theme`。
- 当前公开插件能力不包含可执行的自定义主题 CSS。
- ZCode 3.6.5.4145 已通过一次另行批准的本机版本限定适配验证，确认主工作区、索引栏、消息导轨与装饰层契约可落地。

## 边界

- 这些仓库文件本身不会挂载真实 ZCode，也不包含运行时适配器。
- `#diana-zcode-chrome` 的安全父容器只在 3.6.5.4145 上完成过本机验证，不构成跨版本承诺。
- 不通过修改 `app.asar` 或安装目录来部署。

若后续重新挂载或适配新版本，适配器仍必须：使用用户目录；先校验版本与窗口；只对已确认的主工作区挂载；装饰层保持 `pointer-events: none`；退出后可恢复；不得默认开启固定调试端口、后台监听或持久化守护。
