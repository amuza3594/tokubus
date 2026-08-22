// GTFSデータ（バス停マスタ・運賃テーブル）の「アクティブなデータセット」を管理する。
// 通常はアプリに同梱された内蔵データ（src/data/stopMaster.json・fareTable.json）を
// 使うが、設定画面からGTFSのzipをアップロードすると、その内容をIndexedDBに保存して
// 内蔵データを上書きする（ビルド・デプロイ不要でその場で反映される）。
import db from "./db";
import bundledStopMaster from "./data/stopMaster.json";
import { buildStopMaster, buildFareTable, REQUIRED_GTFS_FILES } from "./gtfsBuilder.js";

export interface RouteDirection {
  stops: string[];
  distanceKm: number | null;
  destination: string;
}

export interface RouteMaster {
  name: string;
  directions: Partial<Record<"往" | "復", RouteDirection>>;
}

interface FareTableData {
  names: string[];
  pairs: [number, number, number][];
}

export interface GtfsOverrideRecord {
  id: "current";
  stopMaster: Record<string, RouteMaster>;
  fareTable: FareTableData;
  uploadedAt: number;
  sourceFileName: string;
  routeCount: number;
  farePairCount: number;
}

export interface GtfsStatus {
  isCustom: boolean;
  uploadedAt: number | null;
  sourceFileName: string | null;
  routeCount: number;
  farePairCount: number;
}

let activeStopMaster = bundledStopMaster as Record<string, RouteMaster>;
let activeFareTableOverride: FareTableData | null = null;
let activeFareLookup: Map<string, number> | null = null;

// fareTable.jsonは850KB程度あるため、メイン画面の初期読み込みを遅くしない
// よう、実際に運賃を検索する場面になって初めて読み込む（動的import）。
let bundledFareTablePromise: Promise<FareTableData> | null = null;
function loadBundledFareTable(): Promise<FareTableData> {
  if (!bundledFareTablePromise) {
    bundledFareTablePromise = import("./data/fareTable.json").then(
      (mod) => mod.default as FareTableData,
    );
  }
  return bundledFareTablePromise;
}

function buildFareLookup(data: FareTableData): Map<string, number> {
  const map = new Map<string, number>();
  for (const [originIdx, destIdx, price] of data.pairs) {
    map.set(`${data.names[originIdx]} ${data.names[destIdx]}`, price);
  }
  return map;
}

// アプリ起動時に一度だけ呼び出し、保存済みのカスタムGTFSデータがあれば
// それをアクティブなデータセットとして読み込む（無ければ内蔵データのまま）。
export async function initGtfsOverride(): Promise<void> {
  const record = await db.gtfsOverride.get("current");
  if (!record) return;
  activeStopMaster = record.stopMaster;
  activeFareTableOverride = record.fareTable;
  activeFareLookup = null;
}

export function getActiveStopMaster(): Record<string, RouteMaster> {
  return activeStopMaster;
}

export async function getActiveFareLookup(): Promise<Map<string, number>> {
  if (!activeFareLookup) {
    const data = activeFareTableOverride ?? (await loadBundledFareTable());
    activeFareLookup = buildFareLookup(data);
  }
  return activeFareLookup;
}

export async function getGtfsStatus(): Promise<GtfsStatus> {
  const record = await db.gtfsOverride.get("current");
  if (record) {
    return {
      isCustom: true,
      uploadedAt: record.uploadedAt,
      sourceFileName: record.sourceFileName,
      routeCount: record.routeCount,
      farePairCount: record.farePairCount,
    };
  }
  const bundledFareTable = await loadBundledFareTable();
  return {
    isCustom: false,
    uploadedAt: null,
    sourceFileName: null,
    routeCount: Object.keys(bundledStopMaster).length,
    farePairCount: bundledFareTable.pairs.length,
  };
}

export async function applyGtfsZip(file: File): Promise<GtfsStatus> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);

  const missing: string[] = [];
  const files: Record<string, string> = {};
  for (const name of REQUIRED_GTFS_FILES) {
    const entry = zip.file(name);
    if (!entry) {
      missing.push(name);
      continue;
    }
    files[name] = await entry.async("text");
  }
  if (missing.length > 0) {
    throw new Error(`zip内に必要なファイルが見つかりません: ${missing.join("、")}`);
  }

  const stopMaster = buildStopMaster(files) as Record<string, RouteMaster>;
  const fareTableRaw = buildFareTable(files) as FareTableData & { skippedAmbiguous: number };
  const fareTable: FareTableData = { names: fareTableRaw.names, pairs: fareTableRaw.pairs };

  const record: GtfsOverrideRecord = {
    id: "current",
    stopMaster,
    fareTable,
    uploadedAt: Date.now(),
    sourceFileName: file.name,
    routeCount: Object.keys(stopMaster).length,
    farePairCount: fareTable.pairs.length,
  };
  await db.gtfsOverride.put(record);

  activeStopMaster = stopMaster;
  activeFareTableOverride = fareTable;
  activeFareLookup = null;

  return {
    isCustom: true,
    uploadedAt: record.uploadedAt,
    sourceFileName: record.sourceFileName,
    routeCount: record.routeCount,
    farePairCount: record.farePairCount,
  };
}

export async function clearGtfsOverride(): Promise<void> {
  await db.gtfsOverride.delete("current");
  activeStopMaster = bundledStopMaster as Record<string, RouteMaster>;
  activeFareTableOverride = null;
  activeFareLookup = null;
}
