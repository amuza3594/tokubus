// GTFS運賃データ（scripts/build-from-gtfs.mjs から生成）を使い、乗車停留所名→
// 降車停留所名の基本運賃（大人・現金）を検索する。
// サイズが大きいため、メイン画面の読み込みを遅くしないよう初回参照時に遅延読み込みする。
interface FareTableData {
  names: string[];
  pairs: [number, number, number][];
}

let lookupPromise: Promise<Map<string, number>> | null = null;

function buildLookup(data: FareTableData): Map<string, number> {
  const map = new Map<string, number>();
  for (const [originIdx, destIdx, price] of data.pairs) {
    map.set(`${data.names[originIdx]} ${data.names[destIdx]}`, price);
  }
  return map;
}

function loadLookup(): Promise<Map<string, number>> {
  if (!lookupPromise) {
    lookupPromise = import("./data/fareTable.json").then((mod) =>
      buildLookup(mod.default as FareTableData),
    );
  }
  return lookupPromise;
}

export async function lookupFare(
  originStopName: string,
  destinationStopName: string,
): Promise<number | null> {
  const origin = originStopName.trim();
  const destination = destinationStopName.trim();
  if (!origin || !destination) return null;
  const lookup = await loadLookup();
  return lookup.get(`${origin} ${destination}`) ?? null;
}
