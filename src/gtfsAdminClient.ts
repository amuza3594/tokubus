// GTFSデータ管理用Cloudflare Worker（worker/）と通信するクライアント。
// パスワードでログインし、GTFSのzipをアップロードすると、Worker側がGitHub
// リポジトリのバス停マスタ・運賃データを直接コミットする（全端末に反映される）。
const TOKEN_KEY = "tokubus-admin-token";

function getApiBase(): string | null {
  const base = import.meta.env.VITE_GTFS_ADMIN_API_URL as string | undefined;
  return base && base.trim() !== "" ? base.replace(/\/$/, "") : null;
}

export function isConfigured(): boolean {
  return getApiBase() !== null;
}

export function isLoggedIn(): boolean {
  return sessionStorage.getItem(TOKEN_KEY) !== null;
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBase();
  if (!base) throw new Error("管理APIのURLが設定されていません。");
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (res.status === 401) logout();
  return res;
}

export async function login(password: string): Promise<void> {
  const res = await apiFetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "ログインに失敗しました");
  sessionStorage.setItem(TOKEN_KEY, data.token);
}

export interface GtfsStatus {
  routeCount: number;
  farePairCount: number;
}

export async function fetchStatus(): Promise<GtfsStatus> {
  const res = await apiFetch("/status");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "状況の取得に失敗しました");
  return data;
}

export interface UploadResult {
  routeCount: number;
  farePairCount: number;
  commitSha: string;
}

export async function uploadGtfsZip(file: File): Promise<UploadResult> {
  const res = await apiFetch("/gtfs", {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "アップロードに失敗しました");
  return data;
}

export async function changePassword(newPassword: string): Promise<void> {
  const res = await apiFetch("/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "パスワードの変更に失敗しました");
}
