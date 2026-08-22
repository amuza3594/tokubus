// GTFSデータ管理用のCloudflare Worker。
// アプリの「⚙ 設定」画面（パスワードログイン後の管理メニュー）から呼び出される。
// GTFSのzipを受け取り、バス停マスタ・運賃テーブルを生成して、GitHubリポジトリの
// src/data/stopMaster.json・fareTable.json を1コミットで更新する（→ 既存の
// GitHub Actionsワークフローが自動でビルド・再デプロイし、全端末に反映される）。
import JSZip from "jszip";
import { REQUIRED_GTFS_FILES, buildStopMaster, buildFareTable } from "../../shared/gtfsBuilder.js";
import { hashPassword, verifyPassword, signSession, verifySession } from "./auth.js";
import { commitGtfsData, fetchCurrentGtfsStats } from "./github.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_PASSWORD = "3594";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24時間

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function getPasswordRecord(env) {
  let record = await env.ADMIN_KV.get("password_hash", "json");
  if (!record) {
    record = await hashPassword(DEFAULT_PASSWORD);
    await env.ADMIN_KV.put("password_hash", JSON.stringify(record));
  }
  return record;
}

async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return verifySession(env.SESSION_SECRET, token);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/login" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const record = await getPasswordRecord(env);
        const valid = await verifyPassword(body.password ?? "", record);
        if (!valid) return json({ error: "パスワードが違います" }, 401);
        const token = await signSession(env.SESSION_SECRET, SESSION_TTL_SECONDS);
        return json({ token });
      }

      // これより下は全て認証必須
      if (!(await requireAuth(request, env))) {
        return json({ error: "認証が必要です。再度ログインしてください。" }, 401);
      }

      if (url.pathname === "/status" && request.method === "GET") {
        const stats = await fetchCurrentGtfsStats(env);
        return json(stats);
      }

      if (url.pathname === "/gtfs" && request.method === "POST") {
        const zipBuffer = await request.arrayBuffer();
        if (zipBuffer.byteLength === 0) {
          return json({ error: "ファイルが空です" }, 400);
        }
        const zip = await JSZip.loadAsync(zipBuffer);

        const missing = [];
        const files = {};
        for (const name of REQUIRED_GTFS_FILES) {
          const entry = zip.file(name);
          if (!entry) {
            missing.push(name);
            continue;
          }
          files[name] = await entry.async("text");
        }
        if (missing.length > 0) {
          return json(
            { error: `zip内に必要なファイルが見つかりません: ${missing.join("、")}` },
            400,
          );
        }

        const stopMaster = buildStopMaster(files);
        const fareTableRaw = buildFareTable(files);
        const fareTable = { names: fareTableRaw.names, pairs: fareTableRaw.pairs };

        const routeCount = Object.keys(stopMaster).length;
        const farePairCount = fareTable.pairs.length;

        const commitSha = await commitGtfsData(env, {
          stopMasterJson: JSON.stringify(stopMaster),
          fareTableJson: JSON.stringify(fareTable),
          message: `GTFSデータを更新（管理画面より、系統${routeCount}件/運賃${farePairCount}件）`,
        });

        return json({ routeCount, farePairCount, commitSha });
      }

      if (url.pathname === "/password" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
        if (newPassword.length < 4) {
          return json({ error: "4文字以上のパスワードを入力してください" }, 400);
        }
        const record = await hashPassword(newPassword);
        await env.ADMIN_KV.put("password_hash", JSON.stringify(record));
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "unknown error" }, 500);
    }
  },
};
