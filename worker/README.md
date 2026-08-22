# GTFSデータ管理用 Cloudflare Worker

アプリの「⚙ 設定」画面からパスワードでログインし、GTFSのzipをアップロードすると、
このWorkerがブラウザの代わりにGTFSを解析し、`src/data/stopMaster.json` と
`src/data/fareTable.json` をGitHubリポジトリに1コミットで書き込みます。
そのコミットが `claude/tokushima-bus-survey-digitalization-j5syhq` ブランチにpushされると、
既存の `.github/workflows/deploy-pages.yml` が自動でビルド・再デプロイし、
**全員の端末に**最新のバス停マスタ・運賃データが反映されます（個々の端末での
アップロード作業は不要）。

## 初回セットアップ（1回だけ）

このWorkerのデプロイには、無料のCloudflareアカウントと `wrangler` CLIが必要です。

1. **Cloudflareアカウントを作成**（無料）: https://dash.cloudflare.com/sign-up

2. **依存パッケージをインストール**

   ```bash
   cd worker
   npm install
   ```

3. **Cloudflareにログイン**

   ```bash
   npx wrangler login
   ```

4. **KVネームスペースを作成**（パスワードのハッシュを保存する場所）

   ```bash
   npx wrangler kv namespace create ADMIN_KV
   ```

   表示された `id = "xxxxxxxx"` を `wrangler.toml` の
   `[[kv_namespaces]]` セクションの `id` に貼り付けてください。

5. **GitHubのアクセストークンを発行**

   GitHub → Settings → Developer settings → Fine-grained personal access tokens →
   「Generate new token」で、このリポジトリ（`amuza3594/tokubus`）だけに
   スコープした、**Contents: Read and write** 権限のトークンを作成してください。
   このトークンは非常に強い権限（リポジトリへの書き込み）を持つため、
   チャットや他人と絶対に共有せず、次の手順で直接Cloudflareに設定してください。

6. **シークレットを設定**（値はチャットに貼り付けず、コマンド実行後にプロンプトで入力してください）

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   # ↑ 手順5で発行したトークンを入力

   npx wrangler secret put SESSION_SECRET
   # ↑ ランダムな文字列（例: openssl rand -hex 32 の出力）を入力
   ```

7. **デプロイ**

   ```bash
   npm run deploy
   ```

   完了すると `https://tokubus-gtfs-admin.<あなたのCloudflareサブドメイン>.workers.dev`
   のようなURLが表示されます。このURLを、アプリ側の設定
   （リポジトリルートの `.github/workflows/deploy-pages.yml` に設定する
   `VITE_GTFS_ADMIN_API_URL`、詳細はリポジトリルートのREADME参照）に設定してください。

8. **初期パスワードは `3594` です。** 初回ログイン後、管理メニューの
   「パスワードを変更」から必ず変更してください。

## エンドポイント

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| POST | `/login` | 不要 | `{password}` → 成功時 `{token}`（24時間有効） |
| GET | `/status` | 必要 | 現在GitHub上にある系統数・運賃ペア数を返す |
| POST | `/gtfs` | 必要 | GTFSのzip（バイナリ）を受け取り解析・GitHubへコミット |
| POST | `/password` | 必要 | `{newPassword}` でパスワードを変更 |

認証は `Authorization: Bearer <token>` ヘッダーで行います。

## ローカル動作確認

```bash
cd worker
npm install
npx wrangler dev
```

`wrangler dev` はCloudflareの実環境にデプロイせず手元で動作確認できますが、
GitHubへの実際のコミットにはシークレット（`GITHUB_TOKEN`）が必要です。
