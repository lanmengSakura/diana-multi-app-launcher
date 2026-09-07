import { useEffect, useRef, useState } from "react";
import { chooseAppPath, readAppLink, saveAppLink, type AppLinkStatus } from "./app-link-api";
import "./app-links.css";

const stateLabels: Record<AppLinkStatus["state"], string> = {
  automatic: "自动识别", linked: "已关联", missing: "待关联",
  invalid: "路径已失效", error: "设置待处理", preview: "网页预览"
};

type Props = {
  target: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
};

export function AppLinkPanel({ target, label, onClose, onSaved, onBusyChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const [info, setInfo] = useState<AppLinkStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    alive.current = true;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    let cancelled = false;
    readAppLink(target).then(status => {
      if (cancelled) return;
      setInfo(status);
      setDraft(status.savedPath ?? status.path ?? "");
    }).catch(reason => {
      if (!cancelled) setError(String(reason));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
      alive.current = false;
      dialog?.close();
    };
  }, [target]);

  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  function closePanel() {
    if (busy) return;
    // Release the native modal focus trap before the parent restores focus.
    dialogRef.current?.close();
    onClose();
  }

  async function perform(action: "pick" | "save" | "automatic" | "refresh") {
    if (busy || !info || (action !== "refresh" && !info.canChoose)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "pick") {
        const chosen = await chooseAppPath(target);
        if (alive.current && chosen !== null) {
          setDraft(chosen);
          setNotice("路径已选好，点击“保存关联”才会记住。尚未启动应用。");
        }
        return;
      }
      const result = action === "refresh"
        ? await readAppLink(target, true)
        : await saveAppLink(target, action === "automatic" ? null : draft);
      if (!alive.current) return;
      setInfo(result);
      setDraft(result.savedPath ?? result.path ?? "");
      setNotice(action === "save"
        ? "关联已保存。关闭此面板后，可主动点击主按钮挂载。"
        : action === "automatic"
          ? "已清除手动路径，恢复自动识别；没有删除程序或主题。"
          : "已重新检查当前位置；没有启动或挂载应用。");
      if (action !== "refresh") onSaved();
    } catch (reason) {
      if (alive.current) setError(String(reason));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="app-link-panel" aria-labelledby="app-link-title"
      aria-describedby="app-link-boundary" onCancel={event => {
        event.preventDefault();
        closePanel();
      }}>
      <header className="app-link-header">
        <div><span className="app-link-eyebrow">LOCAL CONNECTION</span><h2 id="app-link-title">关联 {label}</h2></div>
        <button type="button" className="app-link-close" aria-label="关闭关联设置" disabled={busy} onClick={closePanel}>×</button>
      </header>
      <form onSubmit={event => { event.preventDefault(); void perform("save"); }}>
        <div className="app-link-summary">
          <span className="app-link-state" data-state={info?.state ?? "loading"}>
            <span aria-hidden="true" />{info ? stateLabels[info.state] : error ? "读取失败" : "正在读取"}
          </span>
          <button type="button" className="app-link-text-button" disabled={busy || info?.state === "preview"}
            onClick={() => {
              if (!info) {
                setBusy(true); setError(null);
                readAppLink(target, true).then(status => {
                  if (alive.current) { setInfo(status); setDraft(status.savedPath ?? status.path ?? ""); }
                }).catch(reason => { if (alive.current) setError(String(reason)); })
                  .finally(() => { if (alive.current) setBusy(false); });
              } else { void perform("refresh"); }
            }}>重新检测</button>
        </div>
        <p className="app-link-description">{info?.message ?? "只检查路径，不启动应用、不打开调试端口。"}</p>
        <label className="app-link-label" htmlFor="app-link-path">{info?.kind === "directory" ? "项目根目录" : "应用位置"}</label>
        <div className="app-link-path-row">
          <input id="app-link-path" type="text" value={draft} readOnly={!info?.canChoose} disabled={busy}
            spellCheck={false} autoComplete="off" autoCapitalize="off"
            placeholder={info?.kind === "system" ? "由 Windows 官方安装包自动定位" : "选择或粘贴完整路径"}
            onChange={event => { setDraft(event.target.value); setError(null); setNotice(null); }} />
          {info?.canChoose && <button type="button" className="app-link-button app-link-browse" disabled={busy}
            onClick={() => void perform("pick")}>浏览…</button>}
        </div>
        {info?.canChoose && <p className="app-link-hint">请选择 {info.expected}。支持中文和空格路径，不需要修改环境变量。</p>}
        {info?.kind === "directory" && <p className="app-link-hint">关联只定位项目；依赖安装、构建和模型配置仍按项目说明准备。</p>}
        {error && <p className="app-link-feedback app-link-error" role="alert">{error}</p>}
        {notice && <p className="app-link-feedback" role="status">{notice}</p>}
        <div className="app-link-actions">
          {info?.canChoose && <>
            <button className="app-link-button app-link-save" type="submit" disabled={busy || !draft.trim()}>
              {busy ? "处理中…" : "保存关联"}
            </button>
            <button className="app-link-button" type="button" disabled={busy || info.savedPath === null}
              onClick={() => void perform("automatic")}>恢复自动识别</button>
          </>}
          {!info?.canChoose && <button type="button" className="app-link-button" disabled={busy} onClick={closePanel}>返回启动器</button>}
        </div>
        <p id="app-link-boundary" className="app-link-boundary">仅保存本机位置，不启动、关闭或挂载应用。调试连接仍在实际挂载前单独告知并确认。</p>
      </form>
    </dialog>
  );
}
