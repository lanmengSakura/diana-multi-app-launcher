export type AppLinkStatus = {
  target: string;
  state: "automatic" | "linked" | "missing" | "invalid" | "error" | "preview";
  path: string | null;
  savedPath: string | null;
  canChoose: boolean;
  kind: "file" | "directory" | "system";
  expected: string;
  message: string;
};

export const previewLinkStatus = (target: string): AppLinkStatus => ({
  target, state: "preview", path: null, savedPath: null, canChoose: false,
  kind: target === "codex" ? "system" : target === "deepseek" ? "directory" : "file",
  expected: target === "deepseek" ? "Harness 项目根目录" : "应用程序",
  message: "网页仅展示关联界面，不读取或保存本机路径。请在桌面启动器中使用。"
});

export async function readAppLink(target: string, rescan = false): Promise<AppLinkStatus> {
  if (!("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) return previewLinkStatus(target);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppLinkStatus>("get_app_link_status", { target, rescan });
}

export async function saveAppLink(target: string, path: string | null): Promise<AppLinkStatus> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppLinkStatus>("set_app_link", { target, path });
}

export async function chooseAppPath(target: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("pick_app_path", { target });
}
