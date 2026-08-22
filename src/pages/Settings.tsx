import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyGtfsZip,
  clearGtfsOverride,
  getGtfsStatus,
  type GtfsStatus,
} from "../gtfsOverride";

function formatDateTime(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Settings() {
  const [status, setStatus] = useState<GtfsStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshStatus() {
    setStatus(await getGtfsStatus());
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSuccessMessage(null);
    setProcessing(true);
    try {
      const result = await applyGtfsZip(file);
      setStatus(result);
      setSuccessMessage(
        `更新しました（系統 ${result.routeCount}件 / 運賃データ ${result.farePairCount}件）`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "GTFSデータの読み込みに失敗しました。",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("アップロードしたGTFSデータを削除し、内蔵データに戻しますか？")) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setProcessing(true);
    try {
      await clearGtfsOverride();
      await refreshStatus();
      setSuccessMessage("内蔵データに戻しました。");
    } finally {
      setProcessing(false);
    }
  }

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
            バス停マスタ・運賃データ（GTFS）
          </div>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 0 }}>
            ダイヤ改正や運賃改定があった場合は、最新のGTFSフィード（zipファイル）を
            アップロードすると、停留所の停車順・系統キロ・運賃の自動入力データが
            この端末上で更新されます（ビルド・再デプロイは不要です）。
          </p>

          {status && (
            <div className="route-match" style={{ marginBottom: 14 }}>
              {status.isCustom ? (
                <>
                  ✓ カスタムデータを使用中
                  {status.sourceFileName && `（${status.sourceFileName}）`}
                  <br />
                  アップロード日時:{" "}
                  {status.uploadedAt ? formatDateTime(status.uploadedAt) : "-"}
                  <br />
                  系統 {status.routeCount}件 / 運賃データ {status.farePairCount}件
                </>
              ) : (
                <>
                  内蔵データを使用中（系統 {status.routeCount}件 / 運賃データ{" "}
                  {status.farePairCount}件）
                </>
              )}
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

          {status?.isCustom && (
            <button
              type="button"
              className="btn btn-outline"
              style={{ marginTop: 10 }}
              disabled={processing}
              onClick={handleReset}
            >
              内蔵データに戻す
            </button>
          )}
        </div>
      </div>
    </>
  );
}
