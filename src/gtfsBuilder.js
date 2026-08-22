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
