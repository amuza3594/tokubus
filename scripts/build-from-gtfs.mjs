// GTFSフィード一式から、バス停マスタ（停車順・系統キロ）と運賃テーブルを
// まとめて再生成する。ダイヤ改正や運賃改定でGTFSデータが更新されたら、
// このスクリプト1つを実行するだけで src/data/stopMaster.json と
// src/data/fareTable.json の両方が最新化される（アプリに同梱する「内蔵データ」の更新用）。
//
// アプリの利用者自身がその場でGTFSデータを更新したい場合は、アプリ内の
// 「⚙ 設定」画面からzipをアップロードする方法もある（IndexedDBに保存され、
// 内蔵データを上書きする。こちらはビルド不要でその場で反映される）。
//
// 使い方:
//   node scripts/build-from-gtfs.mjs                 # data/gtfs/ に展開済みのファイルから生成
//   node scripts/build-from-gtfs.mjs path/to/feed.zip # zipをdata/gtfs/に展開してから生成
//
// 必要なGTFSファイル（data/gtfs/ 直下に配置）:
//   stops.txt, routes.txt, trips.txt, stop_times.txt, shapes.txt,
//   fare_attributes.txt, fare_rules.txt
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { REQUIRED_GTFS_FILES, buildStopMaster, buildFareTable } from "../shared/gtfsBuilder.js";

const GTFS_DIR = fileURLToPath(new URL("../data/gtfs/", import.meta.url));
const STOP_MASTER_OUT = fileURLToPath(new URL("../src/data/stopMaster.json", import.meta.url));
const FARE_TABLE_OUT = fileURLToPath(new URL("../src/data/fareTable.json", import.meta.url));

async function extractZipIfGiven() {
  const zipPath = process.argv[2];
  if (!zipPath) return;
  console.log(`zipを展開中: ${zipPath}`);
  const buf = readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  mkdirSync(GTFS_DIR, { recursive: true });
  for (const name of REQUIRED_GTFS_FILES) {
    const entry = zip.file(name);
    if (!entry) {
      console.warn(`  警告: zip内に ${name} が見つかりません（スキップ）`);
      continue;
    }
    const content = await entry.async("nodebuffer");
    writeFileSync(`${GTFS_DIR}${name}`, content);
    console.log(`  展開: ${name}`);
  }
}

function readGtfsFiles() {
  const files = {};
  for (const name of REQUIRED_GTFS_FILES) {
    files[name] = readFileSync(`${GTFS_DIR}${name}`, "utf-8");
  }
  return files;
}

await extractZipIfGiven();
const files = readGtfsFiles();

const stopMaster = buildStopMaster(files);
writeFileSync(STOP_MASTER_OUT, JSON.stringify(stopMaster));
console.log(`バス停マスタ: 路線 ${Object.keys(stopMaster).length}件 / ${(Buffer.byteLength(JSON.stringify(stopMaster)) / 1024).toFixed(1)} KB`);

const fareTable = buildFareTable(files);
writeFileSync(FARE_TABLE_OUT, JSON.stringify({ names: fareTable.names, pairs: fareTable.pairs }));
console.log(
  `運賃テーブル: 停留所名 ${fareTable.names.length}件 / ペア ${fareTable.pairs.length}件（あいまいで除外: ${fareTable.skippedAmbiguous}件） / ${(Buffer.byteLength(JSON.stringify(fareTable)) / 1024).toFixed(1)} KB`,
);
