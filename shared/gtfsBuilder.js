// GTFSフィード（stops/routes/trips/stop_times/shapes/fare_attributes/fare_rules の
// 各txtファイルの中身）から、バス停マスタ（停車順・系統キロ）と運賃テーブルを
// 生成する純粋関数群。Node（scripts/build-from-gtfs.mjs、内蔵データの再生成用）と
// ブラウザ（src/gtfsOverride.ts、設定画面からのアップロード用）の両方から
// 同じロジックを共有するために、ファイルI/Oを含まない形に切り出している。
//
// files引数は { "stops.txt": "...内容...", "routes.txt": "...", ... } の形。

export const REQUIRED_GTFS_FILES = [
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
  "shapes.txt",
  "fare_attributes.txt",
  "fare_rules.txt",
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GTFS配布元によっては、zip直下ではなく1つフォルダを挟んだ中に各txtファイルが
// 入っていることがある。zip直下を探して見つからなければ、階層を問わず探す
// （ただしMacが自動生成する __MACOSX/ 配下のゴミファイルは除外し、複数見つかった
// 場合はパスが最も浅いものを採用する）。
export function findGtfsZipEntry(zip, filename) {
  const direct = zip.file(filename);
  if (direct) return direct;
  const pattern = new RegExp(`(^|/)${escapeRegExp(filename)}$`);
  const matches = zip
    .file(pattern)
    .filter((entry) => !entry.name.split("/").some((part) => part === "__MACOSX" || part.startsWith("._")));
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.name.length - b.name.length);
  return matches[0];
}

export function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const row = {};
    header.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function collapseConsecutive(names) {
  const out = [];
  for (const name of names) {
    if (out.length === 0 || out[out.length - 1] !== name) out.push(name);
  }
  return out;
}

export function buildStopMaster(files) {
  const stops = parseCsv(files["stops.txt"]);
  const routes = parseCsv(files["routes.txt"]);
  const trips = parseCsv(files["trips.txt"]);
  const stopTimes = parseCsv(files["stop_times.txt"]);
  const shapePoints = parseCsv(files["shapes.txt"]);

  const stopIdToName = new Map();
  for (const s of stops) {
    if (s.stop_id) stopIdToName.set(s.stop_id.trim(), s.stop_name.trim());
  }

  const routeIdToName = new Map();
  for (const r of routes) {
    routeIdToName.set(r.route_id.trim(), r.route_long_name.trim() || r.route_short_name.trim());
  }

  // shape_id -> 総距離(km)
  const shapeGroups = new Map();
  for (const p of shapePoints) {
    const id = p.shape_id.trim();
    if (!shapeGroups.has(id)) shapeGroups.set(id, []);
    shapeGroups.get(id).push({
      seq: Number(p.shape_pt_sequence),
      lat: Number(p.shape_pt_lat),
      lon: Number(p.shape_pt_lon),
    });
  }
  const shapeLengthKm = new Map();
  for (const [id, pts] of shapeGroups) {
    pts.sort((a, b) => a.seq - b.seq);
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += haversineKm(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    }
    shapeLengthKm.set(id, total);
  }

  const tripInfo = new Map(); // trip_id -> {routeId, directionId, shapeId}
  for (const t of trips) {
    tripInfo.set(t.trip_id.trim(), {
      routeId: t.route_id.trim(),
      directionId: t.direction_id.trim(),
      shapeId: t.shape_id.trim(),
    });
  }

  // trip_id -> [[stop_sequence, stopName], ...]
  const tripStops = new Map();
  for (const st of stopTimes) {
    const tripId = st.trip_id.trim();
    if (!tripInfo.has(tripId)) continue;
    const name = stopIdToName.get(st.stop_id.trim());
    if (!name) continue;
    if (!tripStops.has(tripId)) tripStops.set(tripId, []);
    tripStops.get(tripId).push([Number(st.stop_sequence), name]);
  }

  // (routeId, directionId) -> [{pattern: string[], shapeKm: number|null}, ...]
  const groups = new Map();
  for (const [tripId, items] of tripStops) {
    const info = tripInfo.get(tripId);
    items.sort((a, b) => a[0] - b[0]);
    const pattern = collapseConsecutive(items.map((x) => x[1]));
    if (pattern.length < 2) continue;
    const key = `${info.routeId} ${info.directionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      pattern,
      shapeKm: info.shapeId ? (shapeLengthKm.get(info.shapeId) ?? null) : null,
    });
  }

  const master = {};
  for (const [key, entries] of groups) {
    const [routeId, directionId] = key.split(" ");

    const byPattern = new Map();
    for (const e of entries) {
      const patternKey = JSON.stringify(e.pattern);
      if (!byPattern.has(patternKey)) byPattern.set(patternKey, { pattern: e.pattern, items: [] });
      byPattern.get(patternKey).items.push(e);
    }
    const best = [...byPattern.values()].sort(
      (a, b) => b.items.length - a.items.length || b.pattern.length - a.pattern.length,
    )[0];

    const kmValues = best.items.map((i) => i.shapeKm).filter((v) => v !== null && v > 0);
    const distanceKm =
      kmValues.length > 0
        ? Math.round((kmValues.reduce((a, b) => a + b, 0) / kmValues.length) * 10) / 10
        : null;

    if (!master[routeId]) master[routeId] = { name: routeIdToName.get(routeId) ?? "", directions: {}, _raw: [] };
    master[routeId]._raw.push({
      directionId,
      stops: best.pattern,
      distanceKm,
      destination: best.pattern[best.pattern.length - 1],
    });
  }

  for (const routeId of Object.keys(master)) {
    const raw = master[routeId]._raw.sort((a, b) => Number(a.directionId) - Number(b.directionId));
    delete master[routeId]._raw;
    const labels = raw.length === 2 ? ["往", "復"] : ["往"];
    raw.forEach((entry, idx) => {
      master[routeId].directions[labels[idx]] = {
        stops: entry.stops,
        distanceKm: entry.distanceKm,
        destination: entry.destination,
      };
    });
  }

  return master;
}

function stopSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union === 0 ? 0 : inter / union;
  const exact = JSON.stringify(a) === JSON.stringify(b) ? 1 : 0;
  return jaccard + exact; // 完全一致は2.0、それ以外は0〜1.0
}

function flipLastDigit(num) {
  const last = num[num.length - 1];
  if (last === "1") return num.slice(0, -1) + "2";
  if (last === "2") return num.slice(0, -1) + "1";
  return null;
}

const CONFIDENT_MATCH_THRESHOLD = 1.5;

// GTFSのdirection_idは往路・復路のどちらが0/1かを意味しないため、buildStopMaster()の
// 出力（GTFSのroute_idをキーとし、方向を便宜上「往」「復」と割り当てたもの）を、
// 実際の系統番号ごとの停車順データ（legacyPatterns、過去のバス停マスタCSV由来）と
// 突き合わせて、実在する系統番号をキーとした形に組み直す。
//
// 突き合わせ方針:
// - 各GTFS方向の停車順を、legacyPatternsの全パターンと比較し、最も一致するものを探す
// - 完全一致（スコア2.0）が見つかった方向は、その系統番号・上下区分を採用する
// - もう片方の方向は、まず「系統番号の末尾1↔2を入れ替えた番号」で一致するか試し
//   （実際の運用で往復が末尾1/2で区別されているケースに対応）、それが無ければ
//   独立に最良一致を探す（ただし採用済みの番号とは重複させない）
// - 両方向とも確信を持って対応付けられなかった系統は、元のGTFS route_idのまま
//   （両方向を便宜上のラベルで内包した形）に残し、呼び出し側で上下区分の手動選択
//   にフォールバックできるようにする
export function relabelWithLegacyNumbers(stopMaster, legacyPatterns) {
  const byKey = new Map(); // "num\tdir" -> stops[]
  for (const p of legacyPatterns) {
    byKey.set(`${p.num}\t${p.dir}`, p.stops);
  }

  function bestMatch(stops, excludeNum) {
    let best = null;
    for (const [key, patternStops] of byKey) {
      const [num] = key.split("\t");
      if (excludeNum && num === excludeNum) continue;
      const score = stopSimilarity(stops, patternStops);
      if (score > 0 && (!best || score > best.score)) best = { key, score };
    }
    return best;
  }

  const relabeled = {};
  const usedNumbers = new Set();

  function claim(num, dir, entry) {
    relabeled[num] = { name: entry.name, directions: { [dir]: entry.direction } };
    usedNumbers.add(num);
  }

  for (const [routeId, route] of Object.entries(stopMaster)) {
    const dirEntries = Object.entries(route.directions); // [["往", {...}], ["復", {...}]]

    if (dirEntries.length === 1) {
      const [, direction] = dirEntries[0];
      const top = bestMatch(direction.stops);
      if (top && top.score >= CONFIDENT_MATCH_THRESHOLD) {
        const [num, dir] = top.key.split("\t");
        if (!usedNumbers.has(num)) {
          claim(num, dir, { name: route.name, direction });
          continue;
        }
      }
      relabeled[routeId] = route; // フォールバック: GTFSのroute_idのまま
      continue;
    }

    const [[gLabelA, dirA], [gLabelB, dirB]] = dirEntries;
    const topA = bestMatch(dirA.stops);
    const topB = bestMatch(dirB.stops);
    const strongA = topA && topA.score >= CONFIDENT_MATCH_THRESHOLD;
    const strongB = topB && topB.score >= CONFIDENT_MATCH_THRESHOLD;

    let assignA = null;
    let assignB = null;

    function assignFromAnchor(anchorTop, anchorDirData, otherDirData) {
      const [anchorNum, anchorDir] = anchorTop.key.split("\t");
      const anchorAssign = { num: anchorNum, dir: anchorDir, entry: { name: route.name, direction: anchorDirData } };
      const flipped = flipLastDigit(anchorNum);
      let otherAssign = null;
      if (flipped) {
        for (const dir of ["往", "復"]) {
          if (byKey.has(`${flipped}\t${dir}`)) {
            otherAssign = { num: flipped, dir, entry: { name: route.name, direction: otherDirData } };
            break;
          }
        }
      }
      if (!otherAssign) {
        const alt = bestMatch(otherDirData.stops, anchorNum);
        if (alt && alt.score >= CONFIDENT_MATCH_THRESHOLD) {
          const [num, dir] = alt.key.split("\t");
          otherAssign = { num, dir, entry: { name: route.name, direction: otherDirData } };
        }
      }
      return [anchorAssign, otherAssign];
    }

    if (strongA && !strongB) {
      [assignA, assignB] = assignFromAnchor(topA, dirA, dirB);
    } else if (strongB && !strongA) {
      [assignB, assignA] = assignFromAnchor(topB, dirB, dirA);
    } else if (strongA && strongB) {
      const [numA] = topA.key.split("\t");
      const [numB] = topB.key.split("\t");
      if (numA !== numB) {
        assignA = { num: numA, dir: topA.key.split("\t")[1], entry: { name: route.name, direction: dirA } };
        assignB = { num: numB, dir: topB.key.split("\t")[1], entry: { name: route.name, direction: dirB } };
      } else if (topA.score >= topB.score) {
        assignA = { num: numA, dir: topA.key.split("\t")[1], entry: { name: route.name, direction: dirA } };
        const alt = bestMatch(dirB.stops, numA);
        if (alt && alt.score >= CONFIDENT_MATCH_THRESHOLD) {
          const [num, dir] = alt.key.split("\t");
          assignB = { num, dir, entry: { name: route.name, direction: dirB } };
        }
      } else {
        assignB = { num: numB, dir: topB.key.split("\t")[1], entry: { name: route.name, direction: dirB } };
        const alt = bestMatch(dirA.stops, numB);
        if (alt && alt.score >= CONFIDENT_MATCH_THRESHOLD) {
          const [num, dir] = alt.key.split("\t");
          assignA = { num, dir, entry: { name: route.name, direction: dirA } };
        }
      }
    }

    const bothResolved =
      assignA && assignB && !usedNumbers.has(assignA.num) && !usedNumbers.has(assignB.num) && assignA.num !== assignB.num;

    if (bothResolved) {
      claim(assignA.num, assignA.dir, assignA.entry);
      claim(assignB.num, assignB.dir, assignB.entry);
    } else {
      relabeled[routeId] = route; // 片方でも不確実ならフォールバック
    }
  }

  return relabeled;
}

export function buildFareTable(files) {
  const stops = parseCsv(files["stops.txt"]);
  const fareAttributes = parseCsv(files["fare_attributes.txt"]);
  const fareRules = parseCsv(files["fare_rules.txt"]);

  const zoneToNames = new Map();
  for (const s of stops) {
    const zone = s.zone_id?.trim();
    const name = s.stop_name?.trim();
    if (!zone || !name) continue;
    if (!zoneToNames.has(zone)) zoneToNames.set(zone, new Set());
    zoneToNames.get(zone).add(name);
  }

  const priceById = new Map();
  for (const f of fareAttributes) {
    priceById.set(f.fare_id.trim(), Number(f.price));
  }

  // 停留所名ペアごとに出現した運賃をすべて集める（路線をまたいで集約）。
  // GTFSは路線(route_id)ごとに運賃を定義しているが、バス停マスタは上下線で
  // 別の系統番号を割り当てる運用と噛み合わないため、系統番号を使わず
  // 「乗車停留所名→降車停留所名」のペアだけで運賃を引けるようにする。
  const pairPrices = new Map();
  for (const r of fareRules) {
    const originNames = zoneToNames.get(r.origin_id.trim());
    const destNames = zoneToNames.get(r.destination_id.trim());
    const price = priceById.get(r.fare_id.trim());
    if (!originNames || !destNames || price === undefined) continue;
    for (const o of originNames) {
      for (const d of destNames) {
        const key = `${o} ${d}`;
        if (!pairPrices.has(key)) pairPrices.set(key, new Set());
        pairPrices.get(key).add(price);
      }
    }
  }

  const nameIndex = new Map();
  function idxOf(name) {
    if (!nameIndex.has(name)) nameIndex.set(name, nameIndex.size);
    return nameIndex.get(name);
  }

  const pairs = [];
  let skippedAmbiguous = 0;
  for (const [key, prices] of pairPrices) {
    if (prices.size > 1) {
      skippedAmbiguous++;
      continue;
    }
    const [origin, dest] = key.split(" ");
    pairs.push([idxOf(origin), idxOf(dest), [...prices][0]]);
  }

  return { names: [...nameIndex.keys()], pairs, skippedAmbiguous };
}
