import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FrameRadiance } from "./FrameRadiance";
import { AppLinkPanel } from "./AppLinkPanel";
import "./styles.css";

type ThemeMode = "dark" | "light" | "system";
type ActionName = "mount" | "restore";
type Phase = "idle" | "working" | "done" | "error";
type TargetId =
  | "codex"
  | "doubao"
  | "terminal"
  | "vscode"
  | "cursor"
  | "grokbot"
  | "deepseek"
  | "zcode";

type ExternalThemeState =
  | "unavailable"
  | "available"
  | "installed"
  | "selected"
  | "deployed"
  | "running"
  | "mounted"
  | "plain"
  | "disabled"
  | "unmanaged"
  | "blocked";

type TargetOption = {
  value: TargetId;
  label: string;
  shortLabel: string;
  hint: string;
  showThemeSwitch: boolean;
  modeTitle: string;
  modeSubtitle: string;
  primaryNote: string;
  secondaryLabel: string;
};

type LauncherStatus = {
  stage: string;
  codexRunning: boolean;
  themeChannelConnected: boolean;
  processCount: number;
  mainProcessId: number | null;
  codexVersion: string | null;
  codexPath: string | null;
  activeThemeMode: ThemeMode | null;
  debugPort: number | null;
  runtimeRoot: string | null;
  compatibilityMode: string;
  runtimeAvailable: boolean;
  nativeAppearanceManaged: boolean;
  actionRequired: string | null;
  message: string;
};

type ExternalTargetStatus = {
  target: TargetId;
  stage: string;
  running: boolean;
  themed: boolean;
  themeState: ExternalThemeState;
  themeScope: string;
  processCount: number;
  mainProcessId: number | null;
  executable: string | null;
  themeRoot: string | null;
  message: string;
};

type MusicTrackStatus = {
  available: boolean;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  issue: string | null;
};

type MusicPlaybackState =
  | "checking"
  | "ready"
  | "playing"
  | "paused"
  | "missing"
  | "error"
  | "preview";

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "dark", label: "暗夜" },
  { value: "light", label: "日间" },
  { value: "system", label: "跟随系统" }
];

const targetOptions: TargetOption[] = [
  {
    value: "codex",
    label: "Codex Desktop",
    shortLabel: "Codex",
    hint: "日夜切换需退出重开；原版启动不挂载皮肤",
    showThemeSwitch: true,
    modeTitle: "选择挂载主题",
    modeSubtitle: "完整美术与原生配色同步",
    primaryNote: "一次性前台挂载；新开调试会话前会说明风险并确认",
    secondaryLabel: "原版启动"
  },
  {
    value: "doubao",
    label: "豆包浏览器",
    shortLabel: "豆包",
    hint: "日夜跟随豆包；原版启动需先完整退出浏览器",
    showThemeSwitch: false,
    modeTitle: "跟随豆包外观",
    modeSubtitle: "日间 / 暗夜由豆包原生设置决定",
    primaryNote: "只加载用户态扩展，不开启调试端口或后台监听",
    secondaryLabel: "原版启动"
  },
  {
    value: "terminal",
    label: "Windows Terminal",
    shortLabel: "终端",
    hint: "Diana PowerShell / CMD 暗夜原生 Fragment",
    showThemeSwitch: false,
    modeTitle: "专属暗夜终端",
    modeSubtitle: "主题 / 原版均新开窗口，不改变已有终端会话",
    primaryNote: "原版启动使用原生配置；旧 Diana 窗口中的命令不会中断",
    secondaryLabel: "原版启动"
  },
  {
    value: "vscode",
    label: "Visual Studio Code",
    shortLabel: "VS Code",
    hint: "先选日间 / 暗夜，再点主按钮应用；原版可直接恢复",
    showThemeSwitch: true,
    modeTitle: "选择 VS Code 配色",
    modeSubtitle: "使用用户扩展与可恢复的 settings.json 设置",
    primaryNote: "先选日间 / 暗夜，再点主按钮；旧安装无恢复记录时使用内置 Modern 主题",
    secondaryLabel: "切回原版"
  },
  {
    value: "cursor",
    label: "Cursor",
    shortLabel: "Cursor",
    hint: "挂载后可直接切换日夜 / 撤下皮肤；调试端口需完整退出才关闭",
    showThemeSwitch: true,
    modeTitle: "选择 Cursor 挂载主题",
    modeSubtitle: "本机适配器核验通过后挂载完整日夜美术",
    primaryNote: "不改写 Cursor 安装资源；完整挂载逐次说明临时调试端口风险",
    secondaryLabel: "切回原版"
  },
  {
    value: "grokbot",
    label: "Grok Bot",
    shortLabel: "Grok Bot",
    hint: "完整 Diana 日夜美术；挂载后可直接切换日夜 / 原版",
    showThemeSwitch: true,
    modeTitle: "选择 Grok Bot 挂载主题",
    modeSubtitle: "原生配色与完整美术层同步切换",
    primaryNote: "不改写应用资源；新开调试会话前会说明风险并确认",
    secondaryLabel: "切回原版"
  },
  {
    value: "deepseek",
    label: "DeepSeek Harness",
    shortLabel: "Harness",
    hint: "启动本机 Harness 服务；日夜在页面内切换",
    showThemeSwitch: false,
    modeTitle: "跟随 Harness 外观",
    modeSubtitle: "日间 / 暗夜由 Harness 页面原生状态决定",
    primaryNote: "等待本地服务就绪后打开页面；此入口不切换为原版，也不消耗模型额度",
    secondaryLabel: "打开页面"
  },
  {
    value: "zcode",
    label: "ZCode",
    shortLabel: "ZCode",
    hint: "挂载后可直接切换日夜 / 原版；调试端口需完整退出才关闭",
    showThemeSwitch: true,
    modeTitle: "选择 ZCode 挂载主题",
    modeSubtitle: "精确版本核验通过后，前台一次性挂载完整美术",
    primaryNote: "新开调试会话前说明风险并确认；不创建后台监听或自启动",
    secondaryLabel: "切回原版"
  }
];

const targetIds = new Set<TargetId>(
  targetOptions.map((option) => option.value)
);

const targetOptionFor = (target: TargetId) =>
  targetOptions.find((option) => option.value === target) ?? targetOptions[0];

const readStoredTarget = (): TargetId => {
  const saved = window.localStorage.getItem("diana-launcher-target") as TargetId;
  return targetIds.has(saved) ? saved : "codex";
};

const browserStatus: LauncherStatus = {
  stage: "interface_preview",
  codexRunning: false,
  themeChannelConnected: false,
  processCount: 0,
  mainProcessId: null,
  codexVersion: null,
  codexPath: null,
  activeThemeMode: null,
  debugPort: null,
  runtimeRoot: null,
  compatibilityMode: "runtime_probe",
  runtimeAvailable: true,
  nativeAppearanceManaged: false,
  actionRequired: null,
  message: "浏览器预览无法读取本机进程；桌面 EXE 启动后会自动检测 Codex，并在短暂失败后重试。"
};

const browserExternalStatus = (target: TargetId): ExternalTargetStatus => ({
  target,
  stage: "interface_preview",
  running: false,
  themed: false,
  themeState: "available",
  themeScope: "preview",
  processCount: 0,
  mainProcessId: null,
  executable: null,
  themeRoot: null,
  message: `浏览器预览不会启动${targetOptionFor(target).shortLabel}；桌面 EXE 才会执行本机检测与安全部署。`
});

const browserMusicTrackStatus: MusicTrackStatus = {
  available: false,
  fileName: null,
  mimeType: null,
  sizeBytes: null,
  issue: "浏览器预览不包含安装包内置音频。"
};

const isTauriRuntime = () =>
  "__TAURI_INTERNALS__" in window || "__TAURI__" in window;

const exitLauncher = async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quit_launcher");
};

function useResolvedTheme(mode: ThemeMode) {
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark"
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const updateTheme = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(event.matches ? "light" : "dark");
    };

    updateTheme(mediaQuery);
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

  return mode === "system" ? systemTheme : mode;
}

function ThemeGlyph({ mode }: { mode: ThemeMode }) {
  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.8 2.6 5.4 6 .8-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9l6-.8L12 2.8Z" />
      </svg>
    );
  }

  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.4 4.5h7.2l.7 2.1 2 .9 2-.9 1.1 2.7-1.9 1.1v3.2l1.9 1.1-1.1 2.7-2-.9-2 .9-.7 2.1H8.4l-.7-2.1-2-.9-2 .9-1.1-2.7 1.9-1.1v-3.2L2.6 9.3l1.1-2.7 2 .9 2-.9.7-2.1Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.4 8.1A8 8 0 1 1 4 14.6" />
      <path d="M4 4.8v4.8h4.8" />
    </svg>
  );
}

function MusicNoteGlyph() {
  return (
    <svg viewBox="7 0 25 32" aria-hidden="true">
      <path d="M20.2 4.2v15.6a5.7 5.7 0 0 0-4.2-.5c-2.9.7-4.8 3-4.2 5.2.5 2.2 3.3 3.5 6.2 2.8 2.6-.6 4.4-2.5 4.4-4.6V10l7.1-1.8V4.9l-9.3 2.3v-3Z" />
    </svg>
  );
}

function App() {
  const [selectedTarget, setSelectedTarget] =
    useState<TargetId>(readStoredTarget);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem("diana-launcher-theme");
    return saved === "light" || saved === "system" ? saved : "dark";
  });
  const [selectorExpanded, setSelectorExpanded] = useState(
    () =>
      window.localStorage.getItem("diana-launcher-selector-collapsed") !== "1"
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<LauncherStatus>(browserStatus);
  const [externalStatus, setExternalStatus] = useState<ExternalTargetStatus>(
    () => browserExternalStatus("doubao")
  );
  const [pendingAction, setPendingAction] = useState<ActionName | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusReadError, setStatusReadError] = useState(false);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const linkBusyRef = useRef(false);
  const [musicTrack, setMusicTrack] = useState<MusicTrackStatus>(
    browserMusicTrackStatus
  );
  const [musicState, setMusicState] =
    useState<MusicPlaybackState>("checking");
  const autoMountTriggeredRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicObjectUrlRef = useRef<string | null>(null);
  const resolvedTheme = useResolvedTheme(themeMode);
  const desktopRuntime = useMemo(isTauriRuntime, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => { linkBusyRef.current = linkBusy; }, [linkBusy]);

  useEffect(() => {
    if (!desktopRuntime) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault();
          if (phaseRef.current === "working" || linkBusyRef.current) {
            setStatus((currentStatus) => ({
              ...currentStatus,
              message: linkBusyRef.current
                ? "请先完成或取消关联设置中的文件选择，启动器暂时保留窗口。"
                : "启动或恢复流程正在完成安全核验，暂时保留启动器窗口，避免辅助流程脱离控制。"
            }));
            return;
          }

          void exitLauncher().catch(() => {
            setStatus((currentStatus) => ({
              ...currentStatus,
              message: "启动器退出调用失败，请稍后重试。"
            }));
          });
        })
      )
      .then((removeListener) => {
        if (disposed) {
          removeListener();
        } else {
          unlisten = removeListener;
        }
      })
      .catch(() => {
        // The desktop close button below applies the same guard.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktopRuntime]);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.targetTheme = resolvedTheme;
    window.localStorage.setItem("diana-launcher-theme", themeMode);
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    setActionError(null);
    setStatusReadError(false);
    if (phaseRef.current !== "working") {
      setPhase("idle");
    }
    window.localStorage.setItem("diana-launcher-target", selectedTarget);
    if (!desktopRuntime && selectedTarget !== "codex") {
      setExternalStatus(browserExternalStatus(selectedTarget));
    }
  }, [desktopRuntime, selectedTarget]);

  useEffect(() => {
    window.localStorage.setItem(
      "diana-launcher-selector-collapsed",
      selectorExpanded ? "0" : "1"
    );
  }, [selectorExpanded]);

  useEffect(() => {
    if (!desktopRuntime) {
      setMusicTrack(browserMusicTrackStatus);
      setMusicState("preview");
      return;
    }

    let cancelled = false;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<MusicTrackStatus>("get_music_track_status"))
      .then((track) => {
        if (cancelled) return;
        setMusicTrack(track);
        setMusicState(track.available ? "ready" : track.issue ? "error" : "missing");
      })
      .catch(() => {
        if (cancelled) return;
        setMusicTrack(browserMusicTrackStatus);
        setMusicState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime]);

  useEffect(
    () => () => {
      const audio = musicAudioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      if (musicObjectUrlRef.current) {
        URL.revokeObjectURL(musicObjectUrlRef.current);
      }
      musicAudioRef.current = null;
      musicObjectUrlRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!desktopRuntime || selectedTarget !== "codex") {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      void import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke<LauncherStatus>("get_launcher_status"))
        .then((nextStatus) => {
          if (!cancelled && phase !== "working") {
            setStatus(nextStatus);
            setStatusReadError(false);
            if (nextStatus.themeChannelConnected) {
              setActionError(null);
              setPhase((currentPhase) =>
                currentPhase === "error" ? "done" : currentPhase
              );
            }
          }
        })
        .catch(() => {
          if (cancelled) return;
          setStatusReadError(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktopRuntime, phase, selectedTarget]);

  useEffect(() => {
    if (!desktopRuntime || selectedTarget === "codex") {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      void import("@tauri-apps/api/core")
        .then(({ invoke }) =>
          invoke<ExternalTargetStatus>("get_external_target_status", {
            target: selectedTarget
          })
        )
        .then((nextStatus) => {
          if (!cancelled && phase !== "working") {
            setExternalStatus(nextStatus);
            setStatusReadError(false);
            if (nextStatus.themeState === "mounted") {
              setActionError(null);
              setPhase((currentPhase) =>
                currentPhase === "error" ? "done" : currentPhase
              );
            }
          }
        })
        .catch(() => {
          if (!cancelled) setStatusReadError(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktopRuntime, phase, selectedTarget]);

  const runPreviewAction = async (
    action: ActionName,
    options?: { riskAccepted?: boolean }
  ) => {
    if (phase === "working") {
      return;
    }

    setActionError(null);

    if (
      action === "mount" &&
      desktopRuntime &&
      (!status.themeChannelConnected || status.activeThemeMode !== themeMode) &&
      !options?.riskAccepted
    ) {
      const runtimeRoot = status.runtimeRoot ?? "%LOCALAPPDATA%\\DianaCodexLauncher\\universal-v1";
      const codexLabel = status.codexVersion ? `Codex v${status.codexVersion}` : "已安装的 Codex";
      const accepted = window.confirm(
        [
          `即将为 ${codexLabel} 启动完整 Diana 美术。`,
          "",
          "启动器会先重新检测官方 MSIX 安装，再用 127.0.0.1 上随机选择的高位调试端口启动 Codex。界面能力探测通过后才挂载 Diana；版本号只用于日志，不作为硬门禁。PowerShell 与 Node.js 适配进程只运行数秒，不创建服务、计划任务、自启动项或后台 watcher；但调试端口会由本次 Codex 进程持有，直到它被完整退出。",
          "",
          "在 Codex 完整退出后，启动器会先备份 config.toml，再只更新 [desktop] 中的日间/暗夜原生配色与当前外观模式；其他模型、项目与行为设置保持不变。“恢复原版”只合并还原这些受管字段。",
          "",
          "同一 Windows 账户下的其他本地进程可能发现该端口，读取当前可见的会话或工作区内容、执行渲染页脚本或截图。回环地址不能替代身份验证。",
          "",
          `本机运行文件：${runtimeRoot}`,
          `事件日志：${runtimeRoot}\\logs\\events.jsonl（不记录会话正文、DOM、截图、令牌或 WebSocket 地址）`,
          "",
          "点击“恢复原版”会撤下样式、完整退出这次 Codex，并从官方入口正常重开。是否了解风险并继续？"
        ].join("\n")
      );
      if (!accepted) return;
    }

    if (
      action === "mount" &&
      desktopRuntime &&
      status.themeChannelConnected &&
      status.activeThemeMode !== themeMode
    ) {
      autoMountTriggeredRef.current = false;
      setPendingAction("mount");
      setPhase("idle");
      setStatus((currentStatus) => ({
        ...currentStatus,
        message: `请从“文件 > 退出 ChatGPT”完整退出。进程结束后，启动器会写入完整 Diana ${modeLabel(themeMode)}原生配色，再自动重新启动并挂载。`
      }));
      return;
    }

    if (
      action === "mount" &&
      desktopRuntime &&
      !status.themeChannelConnected &&
      (status.codexRunning || status.processCount > 0)
    ) {
      autoMountTriggeredRef.current = false;
      setPendingAction("mount");
      setPhase("idle");
      return;
    }

    if (
      action === "restore" &&
      desktopRuntime &&
      (status.codexRunning || status.processCount > 0)
    ) {
      autoMountTriggeredRef.current = false;
      setPendingAction("restore");
      setPhase("idle");
      setStatus((currentStatus) => ({
        ...currentStatus,
        message:
          "请从“文件 > 退出 ChatGPT”完整退出。进程结束后，启动器会只还原受管原生外观字段，并从官方入口重开。"
      }));
      return;
    }

    setPhase("working");
    setStatus((currentStatus) => ({
      ...currentStatus,
      message:
        action === "mount"
          ? "正在重新读取 Codex 运行状态……"
          : "正在确认是否存在需要恢复的修改……"
    }));

    try {
      let nextStatus: LauncherStatus;

      if (desktopRuntime) {
        const { invoke } = await import("@tauri-apps/api/core");
        nextStatus = await invoke<LauncherStatus>("run_launcher_action", {
          action,
          themeMode
        });
      } else {
        nextStatus = {
          ...browserStatus,
          message:
            action === "mount"
              ? "浏览器预览无法读取本机 Codex；未执行启动或挂载操作。"
              : "浏览器预览没有真实改动，因此没有需要恢复的内容。"
        };
      }

      setStatus(nextStatus);
      setActionError(null);
      setPendingAction(null);
      setPhase("done");
    } catch (error) {
      const message = String(error || "启动器操作失败。");
      setActionError(message);
      setPhase("error");
    }
  };

  const runExternalTargetAction = async (
    action: "launch_theme" | "launch_native"
  ) => {
    if (phase === "working") return;
    let experimentalApproved = false;

    if (
      selectedTarget === "cursor" &&
      action === "launch_theme" &&
      desktopRuntime &&
      !externalStatus.running
    ) {
      const runtimeRoot =
        externalStatus.themeRoot ?? "本机已登记的 Diana Cursor 适配器目录";
      const accepted = window.confirm(
        [
          "即将优先为 Cursor 挂载完整 Diana 日夜美术。",
          "",
          "启动器只调用内置审核版本（或已登记旧版）且 SHA-256 清单完全匹配的 Cursor 3.17.21 适配器。适配器会再次核验该应用已验证发布者的数字签名，然后以 --remote-debugging-address=127.0.0.1 和随机高位端口启动 Cursor；短时 Node.js 进程完成界面探测与挂载后立即退出，不修改 Cursor.exe、resources/app 或安装目录，也不创建服务、计划任务、自启动项或后台 watcher。",
          "",
          "临时调试端口没有身份认证。同一 Windows 账户下的其他本地进程可能发现它，读取当前可见界面、执行渲染页脚本或截图。只有完整退出本次全部 Cursor 进程，端口和相应风险才会结束。",
          "",
          `本机适配器：${runtimeRoot}`,
          `事件日志：${runtimeRoot}\\logs\\events.jsonl（不记录代码、聊天正文、DOM、截图、Cookie、令牌或 WebSocket 地址）`,
          "",
          "是否了解风险并继续完整挂载？"
        ].join("\n")
      );
      if (!accepted) return;
      experimentalApproved = true;
    }

    if (
      selectedTarget === "grokbot" &&
      action === "launch_theme" &&
      desktopRuntime &&
      !externalStatus.running
    ) {
      const runtimeRoot =
        externalStatus.themeRoot ?? "本机已登记的 Diana Grok Bot 适配器目录";
      const accepted = window.confirm(
        [
          "即将优先为 Grok Bot 挂载完整 Diana 日夜美术。",
          "",
          "启动器只调用内置审核版本（或已登记旧版）且 SHA-256 清单完全匹配的 Grok Bot 0.28.0 适配器。适配器会再次核验该应用已验证发布者的数字签名，然后以 --remote-debugging-address=127.0.0.1 和随机高位端口启动 Grok Bot；短时 Node.js 进程完成原生日夜切换、界面探测与挂载后立即退出，不修改 Grok Bot.exe、app.asar 或安装目录，也不创建服务、计划任务、自启动项或后台 watcher。",
          "",
          "临时调试端口没有身份认证。同一 Windows 账户下的其他本地进程可能发现它，读取当前可见界面、执行渲染页脚本或截图。只有完整退出本次全部 Grok Bot 进程，端口和相应风险才会结束。",
          "",
          `本机适配器：${runtimeRoot}`,
          `事件日志：${runtimeRoot}\\logs\\events.jsonl（不记录会话正文、DOM、截图、Cookie、令牌或 WebSocket 地址）`,
          "",
          "是否了解风险并继续完整挂载？"
        ].join("\n")
      );
      if (!accepted) return;
      experimentalApproved = true;
    }

    if (
      selectedTarget === "grokbot" &&
      action === "launch_native" &&
      externalStatus.themed &&
      !window.confirm(
        "这会立即撤下 Grok Bot 的 Diana 视觉层，并恢复首次挂载前记录的原生明暗与强调色；临时调试端口仍会由当前 Grok Bot 持有，完整退出全部进程后端口才会关闭。是否继续？"
      )
    ) {
      return;
    }

    if (
      selectedTarget === "cursor" &&
      action === "launch_native" &&
      externalStatus.themed &&
      !window.confirm(
        "这会立即撤下 Cursor 的 Diana 视觉层，不关闭当前窗口。临时调试端口仍保留；完整退出 Cursor 后再次点“切回原版”，可完成剩余设置还原并普通启动。是否继续？"
      )
    ) {
      return;
    }

    if (
      selectedTarget === "zcode" &&
      action === "launch_theme" &&
      desktopRuntime &&
      !externalStatus.running &&
      !externalStatus.themed
    ) {
      const runtimeRoot =
        externalStatus.themeRoot ??
        "%LOCALAPPDATA%\\DianaZCodeTheme\\experimental-3.6.5";
      const accepted = window.confirm(
        [
          "即将优先为 ZCode 挂载完整 Diana 日夜美术。",
          "",
          "启动器只接受已验证的 ZCode 3.6.5.4145 与官方数字签名，然后以 --remote-debugging-address=127.0.0.1 和随机高位端口启动 ZCode。短时 Node.js 适配器完成界面探测与挂载后立即退出；不修改 ZCode.exe、app.asar 或安装目录，也不创建服务、计划任务、自启动项或后台 watcher。",
          "",
          "临时调试端口没有身份认证。同一 Windows 账户下的其他本地进程可能发现它，读取当前可见界面、执行渲染页脚本或截图。回环地址不能消除这一风险；必须完整退出所有本次 ZCode 进程，端口才会关闭。",
          "",
          `本机适配器：${runtimeRoot}`,
          `事件日志：${runtimeRoot}\\logs\\events.jsonl（不记录会话正文、DOM、截图、Cookie、令牌或 WebSocket 地址）`,
          "",
          "是否了解风险并继续完整挂载？"
        ].join("\n")
      );
      if (!accepted) return;
      experimentalApproved = true;
    }

    if (
      selectedTarget === "zcode" &&
      action === "launch_native" &&
      externalStatus.themed &&
      !window.confirm(
        "这会立即撤下 Diana 视觉层，但临时调试端口仍会由当前 ZCode 持有；完整退出所有 ZCode 后端口才会关闭。是否继续？"
      )
    ) {
      return;
    }

    setActionError(null);
    setPhase("working");

    try {
      if (desktopRuntime) {
        const { invoke } = await import("@tauri-apps/api/core");
        const nextStatus = await invoke<ExternalTargetStatus>(
          "run_external_target_action",
          { target: selectedTarget, action, themeMode, experimentalApproved }
        );
        setExternalStatus(nextStatus);
      } else {
        setExternalStatus(browserExternalStatus(selectedTarget));
      }
      setPhase("done");
    } catch (error) {
      setActionError(
        String(
          error || `${targetOptionFor(selectedTarget).shortLabel}启动操作失败。`
        )
      );
      setPhase("error");
    }
  };

  useEffect(() => {
    if (selectedTarget !== "codex" || !pendingAction) {
      autoMountTriggeredRef.current = false;
      return;
    }

    if (
      !desktopRuntime ||
      phase === "working" ||
      status.codexRunning ||
      status.processCount > 0
    ) {
      return;
    }

    if (
      !status.runtimeAvailable ||
      status.stage === "codex_not_installed"
    ) {
      setPendingAction(null);
      return;
    }

    if (autoMountTriggeredRef.current) {
      return;
    }

    autoMountTriggeredRef.current = true;
    const action = pendingAction;
    setPendingAction(null);
    void runPreviewAction(action, { riskAccepted: true });
  }, [
    pendingAction,
    desktopRuntime,
    phase,
    status.codexRunning,
    status.processCount,
    status.runtimeAvailable,
    status.stage,
    selectedTarget
  ]);

  const useMusicToggle = async () => {
    const releaseLoadedMusic = () => {
      const loadedAudio = musicAudioRef.current;
      if (loadedAudio) {
        loadedAudio.onerror = null;
        loadedAudio.pause();
        loadedAudio.src = "";
      }
      if (musicObjectUrlRef.current) {
        URL.revokeObjectURL(musicObjectUrlRef.current);
      }
      musicAudioRef.current = null;
      musicObjectUrlRef.current = null;
    };
    const currentAudio = musicAudioRef.current;
    if (musicState === "playing" && currentAudio) {
      currentAudio.pause();
      setMusicState("paused");
      return;
    }

    if (!desktopRuntime) {
      setMusicState("preview");
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      let track = musicTrack;
      if (!track.available) {
        track = await invoke<MusicTrackStatus>("get_music_track_status");
        setMusicTrack(track);
      }

      if (!track.available) {
        setMusicState("error");
        return;
      }

      let audio = musicAudioRef.current;
      if (!audio) {
        const payload = await invoke<ArrayBuffer>("load_music_track");
        const objectUrl = URL.createObjectURL(
          new Blob([payload], { type: track.mimeType ?? "audio/mpeg" })
        );
        audio = new Audio(objectUrl);
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = 0.34;
        audio.onerror = () => {
          releaseLoadedMusic();
          setMusicTrack((currentTrack) => ({
            ...currentTrack,
            issue: "浏览器音频引擎无法解码这份本机文件。"
          }));
          setMusicState("error");
        };
        musicObjectUrlRef.current = objectUrl;
        musicAudioRef.current = audio;
      }

      await audio.play();
      setMusicState("playing");
    } catch (error) {
      const issue = error instanceof Error ? error.message : String(error);
      releaseLoadedMusic();
      setMusicTrack((currentTrack) => ({ ...currentTrack, issue }));
      setMusicState("error");
    }
  };

  const useWindowAction = async (action: "minimize" | "close") => {
    if (!desktopRuntime) {
      setStatus({
        ...browserStatus,
        message: "窗口控制将在桌面 EXE 中生效，浏览器预览不会关闭。"
      });
      return;
    }

    if (action === "close" && phase === "working") {
      setStatus((currentStatus) => ({
        ...currentStatus,
        message:
          "启动或恢复流程正在完成安全核验，暂时保留启动器窗口，避免辅助流程脱离控制。"
      }));
      return;
    }

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const currentWindow = getCurrentWindow();
    if (action === "minimize") {
      await currentWindow.minimize();
    } else {
      await exitLauncher();
    }
  };

  const statusLabel = actionError
    ? "启动异常"
    : statusReadError
      ? "状态读取异常"
      : pendingAction
    ? "等待 Codex 退出"
    : phase === "working"
      ? "正在读取状态"
      : phase === "error"
        ? "检测异常"
        : status.themeChannelConnected
          ? "Diana 已挂载"
          : status.codexRunning
            ? "Codex 正在运行"
            : status.stage === "codex_not_installed"
              ? "正在检测 Codex"
            : desktopRuntime
              ? "Codex 已就绪"
              : "浏览器预览";

  const statusTone = actionError || statusReadError
    ? "error"
    : pendingAction
    ? "running"
    : phase === "working" || phase === "error"
      ? phase
      : status.themeChannelConnected
        ? "mounted"
        : status.codexRunning
          ? "running"
          : "idle";

  const codexSummary = status.codexRunning
    ? [
        status.codexVersion ? `v${status.codexVersion}` : "版本未知",
        status.mainProcessId ? `PID ${status.mainProcessId}` : "PID 未知",
        `${status.processCount} 个进程`
      ].join(" · ")
    : desktopRuntime
      ? status.codexVersion
        ? `v${status.codexVersion} · 已安装`
        : "正在检测安装"
      : "本机状态不可检测";

  const modeLabel = (mode: ThemeMode | null) =>
    themeOptions.find((option) => option.value === mode)?.label ?? "未知";

  const primaryLabel = pendingAction
    ? pendingAction === "mount"
      ? "等待 Codex 完整退出"
      : "等待退出后原版启动"
    : status.themeChannelConnected
    ? status.activeThemeMode === themeMode
      ? "重新挂载 Diana"
      : `退出 Codex 后切换为 Diana ${modeLabel(themeMode)}`
    : status.codexRunning
      ? "退出 Codex 后挂载"
      : !status.runtimeAvailable
          ? "缺少运行组件"
          : status.stage === "codex_not_installed"
            ? "未检测到 Codex"
            : "启动并挂载";

  const primaryNote = pendingAction
    ? pendingAction === "mount"
      ? "再次点击可取消等待"
      : "可从右侧按钮取消等待"
    : status.themeChannelConnected
    ? status.activeThemeMode === themeMode
      ? "修复当前样式"
      : "完整重启，避免日夜样式混合"
    : status.codexRunning
      ? "不会关闭当前任务"
      : "一次性前台挂载";

  const targetIsCodex = selectedTarget === "codex";
  const selectedTargetOption = targetOptionFor(selectedTarget);
  const targetUsesThemeSwitch = selectedTargetOption.showThemeSwitch;
  const externalNotInstalled = externalStatus.stage.endsWith("_not_installed");
  const externalBlocked =
    externalNotInstalled ||
    externalStatus.stage === "doubao_plain_running" ||
    externalStatus.stage === "cursor_plain_running" ||
    externalStatus.stage === "cursor_unmanaged_debug" ||
    externalStatus.stage === "cursor_runtime_missing" ||
    externalStatus.stage === "grokbot_plain_running" ||
    externalStatus.stage === "grokbot_unmanaged_debug" ||
    externalStatus.stage === "grokbot_runtime_missing" ||
    externalStatus.stage === "grokbot_adapter_invalid" ||
    externalStatus.stage === "zcode_plain_running" ||
    externalStatus.stage === "zcode_unmanaged_debug" ||
    externalStatus.stage === "zcode_runtime_missing";
  const externalMounted = externalStatus.themeState === "mounted";
  const externalStatusLabel = externalMounted
    ? "Diana 已挂载"
    : actionError
      ? "启动异常"
    : statusReadError
      ? "状态读取异常"
      : phase === "working"
        ? `正在启动${selectedTargetOption.shortLabel}`
        : externalStatus.themeState === "disabled"
          ? "Diana 已撤下"
          : externalStatus.themeState === "unmanaged"
            ? "调试实例未接管"
            : externalStatus.themeState === "blocked"
              ? "完整挂载受阻"
        : externalStatus.themeState === "selected"
            ? "Diana 配色已启用"
            : externalStatus.themeState === "installed"
              ? selectedTarget === "terminal"
                ? "Diana 配置已安装"
                : "Diana 主题已安装"
              : externalStatus.themeState === "deployed"
                ? selectedTarget === "vscode"
                  ? "Diana 美术层已部署"
                  : "Diana 源码已部署"
                : externalStatus.themeState === "running" && selectedTarget === "deepseek"
                  ? "Diana 服务运行中"
          : externalStatus.stage === "doubao_plain_running"
            ? "普通豆包运行中"
            : externalStatus.stage === "cursor_plain_running"
              ? "普通 Cursor 运行中"
            : externalStatus.stage === "grokbot_plain_running"
              ? "普通 Grok Bot 运行中"
            : externalStatus.stage === "doubao_theme_missing" ||
                externalStatus.stage === "terminal_pack_ready" ||
                externalStatus.stage === "vscode_pack_ready" ||
                externalStatus.stage === "cursor_pack_ready"
              ? "主题待安装"
              : externalStatus.stage === "deepseek_theme_needs_deploy"
                ? "主题待合并"
                : externalNotInstalled
                  ? `未检测到${selectedTargetOption.shortLabel}`
                  : `${selectedTargetOption.shortLabel}已就绪`;
  const externalStatusTone = externalMounted
    ? "mounted"
    : actionError || statusReadError
      ? "error"
    : phase === "working"
      ? "working"
      : externalStatus.running
          ? "running"
          : "idle";
  const externalSummary = externalStatus.running
    ? [
        externalStatus.mainProcessId
          ? `PID ${externalStatus.mainProcessId}`
          : "PID 未知",
        `${externalStatus.processCount} 个进程`
      ].join(" · ")
    : externalStatus.executable
      ? "已检测 · 等待启动"
      : externalStatus.themeRoot
        ? "资源已检测 · 等待部署"
        : desktopRuntime
          ? "尚未检测"
          : "本机状态不可检测";
  const externalPrimaryLabel = (() => {
    if (externalNotInstalled) {
      return `未检测到${selectedTargetOption.shortLabel}`;
    }
    switch (selectedTarget) {
      case "doubao":
        if (externalStatus.stage === "doubao_plain_running") {
          return "请先退出普通豆包";
        }
        if (externalStatus.stage === "doubao_theme_missing") {
          return "安装并启动 Diana 豆包";
        }
        return externalStatus.themed ? "打开 Diana 豆包" : "启动 Diana 豆包";
      case "terminal":
        return externalStatus.themed
          ? "打开 Diana 终端"
          : "安装并打开 Diana 终端";
      case "vscode":
        return `应用并打开 Diana ${modeLabel(themeMode)}`;
      case "cursor":
        if (externalStatus.stage === "cursor_plain_running") {
          return "请先退出普通 Cursor";
        }
        if (externalStatus.stage === "cursor_unmanaged_debug") {
          return "请先退出当前 Cursor";
        }
        if (externalStatus.stage === "cursor_runtime_missing") {
          return "缺少运行组件";
        }
        if (externalStatus.stage === "cursor_theme_disabled") {
          return `重新挂载 Diana ${modeLabel(themeMode)}`;
        }
        if (externalStatus.stage === "cursor_color_ready" ||
            externalStatus.stage === "cursor_pack_ready") {
          return `应用并打开 Diana ${modeLabel(themeMode)}配色`;
        }
        return externalStatus.themed
          ? `应用 Diana ${modeLabel(themeMode)}`
          : `挂载并启动 Diana ${modeLabel(themeMode)}`;
      case "grokbot":
        if (externalStatus.stage === "grokbot_plain_running") {
          return "请先退出普通 Grok Bot";
        }
        if (externalStatus.stage === "grokbot_unmanaged_debug") {
          return "请先退出当前 Grok Bot";
        }
        if (externalStatus.stage === "grokbot_runtime_missing") {
          return "缺少本机适配器";
        }
        if (externalStatus.stage === "grokbot_adapter_invalid") {
          return "适配器校验失败";
        }
        if (externalStatus.stage === "grokbot_theme_disabled") {
          return `重新挂载 Diana ${modeLabel(themeMode)}`;
        }
        return externalStatus.themed
          ? `应用 Diana ${modeLabel(themeMode)}`
          : `挂载并启动 Diana ${modeLabel(themeMode)}`;
      case "deepseek":
        if (externalStatus.stage === "deepseek_theme_needs_deploy") {
          return "解包 Diana 蓝图";
        }
        return externalStatus.running
          ? "打开 Diana Harness"
          : "启动 Diana Harness";
      case "zcode":
        if (externalStatus.stage === "zcode_plain_running") {
          return "请先退出普通 ZCode";
        }
        if (externalStatus.stage === "zcode_unmanaged_debug") {
          return "请先退出当前 ZCode";
        }
        if (externalStatus.stage === "zcode_runtime_missing") {
          return "缺少运行组件";
        }
        if (externalStatus.stage === "zcode_theme_disabled") {
          return `重新挂载 Diana ${modeLabel(themeMode)}`;
        }
        return externalStatus.themed
          ? `应用 Diana ${modeLabel(themeMode)}`
          : `挂载并启动 Diana ${modeLabel(themeMode)}`;
      default:
        return `启动${selectedTargetOption.shortLabel}`;
    }
  })();
  const displayStatusLabel = targetIsCodex ? statusLabel : externalStatusLabel;
  const displayStatusTone = targetIsCodex ? statusTone : externalStatusTone;
  const displaySummary = targetIsCodex ? codexSummary : externalSummary;
  const displayMessage = targetIsCodex
    ? pendingAction
      ? pendingAction === "restore"
        ? "请从“文件 > 退出 ChatGPT”完整退出；所有相关进程结束后，启动器会恢复受管原生外观字段并从官方入口重开。"
        : `请从“文件 > 退出 ChatGPT”完整退出；所有相关进程结束后，启动器会同步完整 Diana ${modeLabel(themeMode)}原生配色并重新挂载。`
      : actionError
        ? actionError
        : statusReadError
          ? "暂时无法读取本机状态；启动器没有执行系统操作，正在自动重试。"
          : status.message
    : externalMounted
      ? externalStatus.message
      : actionError
        ? actionError
      : statusReadError
        ? `暂时无法读取${selectedTargetOption.shortLabel}状态；启动器没有执行系统操作，正在自动重试。`
        : externalStatus.message;
  const displayPrimaryLabel = targetIsCodex
    ? primaryLabel
    : externalPrimaryLabel;
  const displayPrimaryNote = targetIsCodex
    ? primaryNote
    : selectedTargetOption.primaryNote;
  const displayRuntimeChip = targetIsCodex
    ? desktopRuntime
      ? actionError
        ? "ERROR"
        : statusReadError
          ? "RETRY"
          : pendingAction
            ? "WAITING"
            : status.themeChannelConnected
              ? "MOUNTED"
              : "READY"
      : "BROWSER"
    : externalMounted
      ? "MOUNTED"
      : actionError
        ? "ERROR"
      : statusReadError
        ? "RETRY"
        : externalStatus.themeState === "selected"
            ? "COLOR"
            : externalStatus.themeState === "installed"
              ? "INSTALLED"
              : externalStatus.themeState === "deployed"
                ? "DEPLOYED"
                : externalStatus.themeState === "disabled"
                  ? "DISABLED"
                  : externalStatus.themeState === "blocked"
                    ? "BLOCKED"
                    : externalStatus.running || externalStatus.themeState === "running"
                      ? "RUNNING"
                      : externalStatus.themeState === "unavailable"
                        ? "MISSING"
                      : "READY";
  const musicButtonLabel =
    musicState === "playing"
      ? "暂停 Hopeful Dreamer"
      : musicTrack.available
        ? "播放 Hopeful Dreamer"
        : "Hopeful Dreamer 尚未内置";
  const musicButtonTitle = (() => {
    if (musicState === "playing") return "暂停《Hopeful Dreamer》";
    if (musicTrack.available) {
      return `播放《Hopeful Dreamer》${musicTrack.fileName ? ` · ${musicTrack.fileName}` : ""}`;
    }
    if (musicTrack.issue) return musicTrack.issue;
    if (musicState === "checking") return "正在检测安装包内置《Hopeful Dreamer》音频";
    if (musicState === "preview") return "正式桌面 EXE 将直接播放安装包内置音频";
    return "当前安装包尚未内置《Hopeful Dreamer》音频";
  })();

  return (
    <main
      className={`launcher-stage phase-${phase}`}
      data-selected-theme={themeMode}
      data-selected-target={selectedTarget}
      data-selector-state={selectorExpanded ? "expanded" : "collapsed"}
      aria-label="Diana 多合一启动器"
    >
      <section className="integrated-board" data-tauri-drag-region>
        <img
          className="target-assembly-art"
          src="/assets/diana-brand/accessories/diana-target-selector-assembly-v3.png"
          alt=""
          aria-hidden="true"
          draggable="false"
        />

        <span className="target-anchor-art" aria-hidden="true">
          <img
            src="/assets/diana-brand/accessories/diana-target-selector-assembly-v3.png"
            alt=""
            draggable="false"
          />
        </span>

        <FrameRadiance />

        <img
          className="integrated-art"
          src="/assets/diana-brand/diana-launcher-integrated-edgecut-v11.png"
          alt="嘉然、阿草与嘉心糖组成的 Diana 电子立牌启动器"
          draggable="false"
        />

        <button
          className="music-toggle"
          type="button"
          data-state={musicState}
          data-track-ready={musicTrack.available ? "true" : "false"}
          aria-label={musicButtonLabel}
          aria-pressed={musicState === "playing"}
          title={musicButtonTitle}
          onClick={() => void useMusicToggle()}
        >
          <span className="music-toggle__halo" aria-hidden="true" />
          <MusicNoteGlyph />
          <span className="music-toggle__state" aria-hidden="true" />
          <span className="music-toggle__notes" aria-hidden="true">
            <span className="music-toggle__note"><MusicNoteGlyph /></span>
            <span className="music-toggle__note"><MusicNoteGlyph /></span>
            <span className="music-toggle__note"><MusicNoteGlyph /></span>
          </span>
        </button>

        <img
          className={`generated-theme-deck${targetUsesThemeSwitch ? " generated-theme-deck--tabs" : ""}`}
          src={
              targetUsesThemeSwitch
               ? themeMode === "dark"
                ? "/assets/diana-brand/button-decks/theme-dark-selected-full-v15.png"
                : themeMode === "light"
                  ? "/assets/diana-brand/button-decks/theme-light-selected-full-v14.png"
                  : "/assets/diana-brand/button-decks/theme-system-selected-full-v14.png"
              : "/assets/diana-brand/button-decks/theme-doubao-full-v16.png"
          }
          alt=""
          aria-hidden="true"
          draggable="false"
        />

        <button
          className="selector-toggle"
          type="button"
          aria-label={selectorExpanded ? "隐藏目标应用列表" : "展开目标应用列表"}
          aria-controls="target-app-dock"
          aria-expanded={selectorExpanded}
          title={selectorExpanded ? "隐藏目标应用列表" : "展开目标应用列表"}
          onClick={() => setSelectorExpanded((expanded) => !expanded)}
        />

        <div
          className="selector-collapse-hint"
          aria-hidden="true"
        >
          <span>{selectorExpanded ? "隐藏应用" : "展开应用"}</span>
        </div>

        <div className="window-actions" aria-label="窗口操作">
          <button
            className="window-action minimize"
            type="button"
            aria-label="最小化"
            onClick={() => void useWindowAction("minimize")}
          />
          <button
            className="window-action close"
            type="button"
            aria-label="关闭"
            onClick={() => void useWindowAction("close")}
          />
        </div>

        <section className="control-deck" aria-label="Diana 启动器控制区">
          {targetUsesThemeSwitch ? (
            <fieldset className="theme-fieldset">
              <legend>{selectedTargetOption.modeTitle}</legend>
              <div className="theme-switch" role="group" aria-label="界面主题" title="先选择外观，再点击下方主按钮应用">
                {themeOptions.map((option) => (
                  <button
                    className={`theme-option ${themeMode === option.value ? "selected" : ""}`}
                    type="button"
                    key={option.value}
                    aria-pressed={themeMode === option.value}
                    onClick={() => setThemeMode(option.value)}
                  >
                    <ThemeGlyph mode={option.value} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="external-theme-note">
              <span className="external-theme-glyph" aria-hidden="true">✦</span>
              <span>
                <strong>{selectedTargetOption.modeTitle}</strong>
                <small>{selectedTargetOption.modeSubtitle}</small>
              </span>
            </div>
          )}

          <div className="action-row">
            <button
              className="primary-action"
              type="button"
              aria-label={displayPrimaryLabel}
              title={displayPrimaryNote}
              disabled={
                phase === "working" ||
                (targetIsCodex
                  ? pendingAction === "restore" ||
                    (desktopRuntime &&
                      (!status.runtimeAvailable ||
                        status.stage === "codex_not_installed"))
                  : externalBlocked)
              }
              onClick={() => {
                if (!targetIsCodex) {
                  void runExternalTargetAction("launch_theme");
                  return;
                }
                if (pendingAction === "mount") {
                  setPendingAction(null);
                  return;
                }
                void runPreviewAction("mount");
              }}
            >
              <span className="primary-face" aria-hidden="true" />
              {phase === "working" ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>
                    {targetIsCodex
                      ? "正在读取状态"
                      : `正在启动${selectedTargetOption.shortLabel}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="action-spark" aria-hidden="true" />
                  <span className="primary-label">{displayPrimaryLabel}</span>
                </>
              )}
            </button>

            <button
              className="secondary-action"
              type="button"
              disabled={
                phase === "working" ||
                (targetIsCodex
                  ? pendingAction === "mount"
                  : externalNotInstalled)
              }
              onClick={() => {
                if (!targetIsCodex) {
                  void runExternalTargetAction("launch_native");
                  return;
                }
                if (pendingAction === "restore") {
                  setPendingAction(null);
                  return;
                }
                if (
                  status.themeChannelConnected &&
                  !window.confirm(
                    "原版启动不是热切换：请先完整退出 Codex；启动器随后只还原受管外观字段，并从官方入口重新打开，不挂载 Diana 皮肤。现在继续吗？"
                  )
                ) {
                  return;
                }
                void runPreviewAction("restore");
              }}
            >
              <RestoreGlyph />
              <span>
                {targetIsCodex
                  ? pendingAction === "restore"
                    ? "取消等待"
                    : selectedTargetOption.secondaryLabel
                  : selectedTargetOption.secondaryLabel}
              </span>
            </button>
          </div>
        </section>

        <section className="status-overlay" aria-live="polite">
          <div className="status-heading">
            <div className="status-title">
              <span className={`status-dot ${displayStatusTone}`} aria-hidden="true" />
              <strong>{displayStatusLabel}</strong>
            </div>
            <span className="runtime-chip">{displayRuntimeChip}</span>
          </div>
          <p title={displayMessage}>{displayMessage}</p>
          <div
            className="status-meta"
            title={targetIsCodex ? status.codexPath ?? undefined : externalStatus.executable ?? undefined}
          >
            <span>{displaySummary}</span>
            <span>
              {targetIsCodex
                ? status.themeChannelConnected
                  ? `Diana ${modeLabel(status.activeThemeMode)}${status.debugPort ? ` · ${status.debugPort}` : ""}`
                  : `目标 · ${modeLabel(themeMode)}`
                : externalStatus.themeState === "mounted"
                  ? selectedTarget === "zcode" || selectedTarget === "cursor" || selectedTarget === "grokbot"
                    ? `Diana · ${modeLabel(themeMode)}`
                    : "Diana · 跟随原生"
                  : externalStatus.themeState === "selected"
                    ? `Diana 配色 · ${modeLabel(themeMode)}`
                    : externalStatus.themeState === "installed"
                      ? selectedTarget === "terminal"
                        ? "Diana Fragment · 已安装"
                        : "Diana 主题 · 已安装"
                      : externalStatus.themeState === "deployed"
                        ? selectedTarget === "vscode"
                          ? "Diana 美术层 · 已部署"
                          : "Diana 源码 · 已部署"
                        : externalStatus.themeState === "running" && selectedTarget === "deepseek"
                          ? "Diana 源码 · 服务运行"
                  : selectedTarget === "zcode" || selectedTarget === "grokbot"
                    ? "完整挂载 · 待启动"
                    : `目标 · ${selectedTargetOption.shortLabel}`}
            </span>
          </div>
        </section>

        <button type="button" className="app-link-trigger" aria-label={`关联 ${selectedTargetOption.label} 的本机位置`}
          title="关联应用位置（不启动或挂载）" aria-haspopup="dialog" aria-expanded={linkPanelOpen}
          disabled={phase === "working" || pendingAction !== null}
          onClick={() => setLinkPanelOpen(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M8 6.5 10.5 4a3.9 3.9 0 0 1 5.5 5.5L13.5 12M12 13.5 9.5 16A3.9 3.9 0 0 1 4 10.5L6.5 8M7 13l6-6" />
          </svg>
          <span>关联</span>
        </button>

        <section
          id="target-app-dock"
          className="target-dock"
          aria-label="目标应用选择"
          aria-hidden={!selectorExpanded}
        >
          <div className="target-dock-heading">
            <span>目标应用</span>
            <small>EXTENSIBLE LIST</small>
          </div>
          <div className="target-select-shell">
            <span className="target-spark" aria-hidden="true">✦</span>
            <select
              value={selectedTarget}
              aria-label="选择要启动和挂载主题的应用"
              disabled={!selectorExpanded}
              tabIndex={selectorExpanded ? 0 : -1}
              onChange={(event) => {
                const target = event.target.value as TargetId;
                setSelectedTarget(target);
                setPendingAction(null);
                setActionError(null);
                setStatusReadError(false);
                setPhase("idle");
              }}
            >
              {targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="target-chevron" aria-hidden="true">⌄</span>
          </div>
          <p>
            <strong>{selectedTargetOption.shortLabel}</strong>
            <span>{selectedTargetOption.hint}</span>
          </p>
        </section>
      </section>
      {linkPanelOpen && <AppLinkPanel key={selectedTarget} target={selectedTarget} label={selectedTargetOption.label}
        onClose={() => { setLinkPanelOpen(false); document.querySelector<HTMLButtonElement>(".app-link-trigger")?.focus(); }}
        onSaved={() => { setActionError(null); setStatusReadError(false); setPhase("idle"); }}
        onBusyChange={setLinkBusy} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
