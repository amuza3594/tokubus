import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  changePassword,
  fetchStatus,
  isConfigured,
  isLoggedIn,
  login,
  logout,
  uploadGtfsZip,
  type GtfsStatus,
} from "../gtfsAdminClient";

export default function Settings() {
  if (!isConfigured()) {
    return (
      <>
        <div className="top-bar">
          <Link className="back" to="/">
            ← 一覧
          </Link>
          <h1>設定</h1>
        </div>
        <div className="page">
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>
              GTFSデータ管理
            </div>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              GTFSデータ管理用のAPI（Cloudflare Worker）がまだ設定されていません。
              セットアップ手順は <code>worker/README.md</code> を参照してください。
            </p>
          </div>
        </div>
      </>
    );
  }

  return <SettingsBody />;
}

function SettingsBody() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  return (
    <>
      <div className="top-bar">
        <Link className="back" to="/">
          ← 一覧
        </Link>
        <h1>設定</h1>
      </div>
      <div className="page">
        {loggedIn ? (
          <AdminPanel onLogout={() => setLoggedIn(false)} />
        ) : (
          <LoginForm onLoggedIn={() => setLoggedIn(true)} />
        )}
      </div>
    </>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="section-title" style={{ marginTop: 0 }}>
        管理者ログイン
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 0 }}>
        GTFSデータの更新には管理者パスワードが必要です。
      </p>
      <div className="field">
        <label>パスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </div>
      {error && (
        <div className="route-match" style={{ color: "var(--color-danger)" }}>
          {error}
        </div>
      )}
      <button className="btn btn-primary" disabled={!password || loading}>
        {loading ? "確認中..." : "ログイン"}
      </button>
    </form>
  );
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [status, setStatus] = useState<GtfsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStatus()
      .then((s) => {
        setStatusError(null);
        setStatus(s);
      })
      .catch((err) => {
        setStatusError(
          err instanceof Error ? err.message : "状況の取得に失敗しました",
        );
        if (!isLoggedIn()) onLogout();
      });
  }, [onLogout]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSuccessMessage(null);
    setProcessing(true);
    try {
      const result = await uploadGtfsZip(file);
      setStatus({ routeCount: result.routeCount, farePairCount: result.farePairCount });
      setSuccessMessage(
        `GitHubにコミットしました（系統 ${result.routeCount}件 / 運賃データ ${result.farePairCount}件）。` +
          "自動ビルドが完了すると（1〜2分程度）全端末に反映されます。",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "GTFSデータの更新に失敗しました。",
      );
      if (!isLoggedIn()) onLogout();
    } finally {
      setProcessing(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 4) {
      setPasswordError("4文字以上のパスワードを入力してください");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("確認用パスワードが一致しません");
      return;
    }
    setProcessing(true);
    try {
      await changePassword(newPassword);
      setPasswordSaved(true);
      setNewPassword("");
      setNewPasswordConfirm("");
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "パスワードの変更に失敗しました",
      );
      if (!isLoggedIn()) onLogout();
    } finally {
      setProcessing(false);
    }
  }

  function handleLogout() {
    logout();
    onLogout();
  }

  return (
    <>
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          バス停マスタ・運賃データ（GTFS）
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 0 }}>
          ダイヤ改正や運賃改定があった場合は、最新のGTFSフィード（zipファイル）を
          アップロードすると、GitHub上のデータが更新され、全端末のアプリに反映されます
          （1〜2分程度かかります）。
        </p>

        {statusError && (
          <div className="route-match" style={{ color: "var(--color-danger)" }}>
            {statusError}
          </div>
        )}
        {status && (
          <div className="route-match">
            現在のデータ: 系統 {status.routeCount}件 / 運賃データ {status.farePairCount}件
          </div>
        )}

        {error && (
          <div className="route-match" style={{ color: "var(--color-danger)" }}>
            {error}
          </div>
        )}
        {successMessage && !error && (
          <div className="route-match">{successMessage}</div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          disabled={processing}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={processing}
          onClick={() => fileInputRef.current?.click()}
        >
          {processing ? "処理中..." : "GTFSのzipファイルを選択して更新"}
        </button>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          管理者パスワード
        </div>
        {!showPasswordForm ? (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setShowPasswordForm(true);
              setPasswordSaved(false);
            }}
          >
            パスワードを変更
          </button>
        ) : (
          <form onSubmit={handlePasswordSubmit}>
            <div className="field">
              <label>新しいパスワード</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label>新しいパスワード（確認）</label>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </div>
            {passwordError && (
              <div className="route-match" style={{ color: "var(--color-danger)" }}>
                {passwordError}
              </div>
            )}
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowPasswordForm(false)}
              >
                キャンセル
              </button>
              <button className="btn btn-primary" disabled={processing}>
                変更する
              </button>
            </div>
          </form>
        )}
        {passwordSaved && (
          <div className="route-match" style={{ marginTop: 10 }}>
            パスワードを変更しました。
          </div>
        )}
      </div>

      <button type="button" className="btn btn-outline" onClick={handleLogout}>
        ログアウト
      </button>
    </>
  );
}
