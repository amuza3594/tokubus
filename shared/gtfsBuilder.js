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

  // (routeId, directionId) -> [{pattern: string[], shapeId: string, shapeKm: number|null}, ...]
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
      shapeId: info.shapeId,
      shapeKm: info.shapeId ? (shapeLengthKm.get(info.shapeId) ?? null) : null,
    });
  }

  function averageDistanceKm(items) {
    const kmValues = items.map((i) => i.shapeKm).filter((v) => v !== null && v > 0);
    return kmValues.length > 0
      ? Math.round((kmValues.reduce((a, b) => a + b, 0) / kmValues.length) * 10) / 10
      : null;
  }

  // パターンの中で最も多く使われているshape_idを、そのパターンの代表shape_idとする
  function modeShapeId(items) {
    const counts = new Map();
    for (const i of items) {
      if (!i.shapeId) continue;
      counts.set(i.shapeId, (counts.get(i.shapeId) ?? 0) + 1);
    }
    let best = null;
    for (const [id, count] of counts) {
      if (!best || count > best.count) best = { id, count };
    }
    return best ? best.id : null;
  }

  const master = {};
  // 同一(route_id, direction_id)の中に、便によって停車順が異なる複数のパターンが
  // 混在する場合がある。多くは便ごとの微妙なゆらぎ（ノイズ）だが、中には
  // 同じroute_id・direction_idを共有する別の実系統番号（枝分かれ系統。例:
  // 系統2531/2532が系統2541/2542と同じroute_id・方向を共有するケース）が
  // 紛れていることがある。最頻パターンはこれまで通りmasterの往復に採用しつつ、
  // それ以外のパターンもextraCandidatesとして残し、relabelWithLegacyNumbers側で
  // 旧マスタと突き合わせて実系統番号と確実に一致すれば別系統として拾えるようにする
  // （一致しなければ従来通り捨てられるだけなので、既存の挙動を壊さない）。
  //
  // shape_id -> そのshape_idを使うパターン(文字列化)の集合。1つのshape_idに
  // 複数の異なるパターンが結びついている場合、そのshape_idは系統番号として
  // 信頼できない（後述のrelabelWithLegacyNumbers側でshape_idを直接系統番号として
  // 使う際、あいまいなshape_idを除外するために使う）。
  const shapeIdPatternKeys = new Map();
  function notePattern(shapeId, patternKey) {
    if (!shapeId) return;
    if (!shapeIdPatternKeys.has(shapeId)) shapeIdPatternKeys.set(shapeId, new Set());
    shapeIdPatternKeys.get(shapeId).add(patternKey);
  }

  const extraCandidates = [];
  for (const [key, entries] of groups) {
    const [routeId, directionId] = key.split(" ");

    const byPattern = new Map();
    for (const e of entries) {
      const patternKey = JSON.stringify(e.pattern);
      if (!byPattern.has(patternKey)) byPattern.set(patternKey, { pattern: e.pattern, items: [] });
      byPattern.get(patternKey).items.push(e);
      notePattern(e.shapeId, patternKey);
    }
    const sorted = [...byPattern.values()].sort(
      (a, b) => b.items.length - a.items.length || b.pattern.length - a.pattern.length,
    );
    const best = sorted[0];
    const routeName = routeIdToName.get(routeId) ?? "";

    if (!master[routeId]) master[routeId] = { name: routeName, directions: {}, _raw: [] };
    master[routeId]._raw.push({
      directionId,
      stops: best.pattern,
      distanceKm: averageDistanceKm(best.items),
      destination: best.pattern[best.pattern.length - 1],
      shapeId: modeShapeId(best.items),
    });

    for (let i = 1; i < sorted.length; i++) {
      const group = sorted[i];
      extraCandidates.push({
        name: routeName,
        stops: group.pattern,
        distanceKm: averageDistanceKm(group.items),
        destination: group.pattern[group.pattern.length - 1],
        shapeId: modeShapeId(group.items),
      });
    }
  }

  // 複数の異なる停車パターンに使い回されているshape_idは、系統番号の代わりとして
  // 信頼できないため、後段のshape_idベース照合では無視する
  const ambiguousShapeIds = new Set(
    [...shapeIdPatternKeys].filter(([, set]) => set.size > 1).map(([id]) => id),
  );
  for (const c of extraCandidates) {
    if (c.shapeId && ambiguousShapeIds.has(c.shapeId)) c.shapeId = null;
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
        shapeId: entry.shapeId && ambiguousShapeIds.has(entry.shapeId) ? null : entry.shapeId,
      };
    });
  }

  return { master, extraCandidates };
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
// 実在する系統番号をキーとした形に組み直す。
//
// 判定の優先順位:
// 1. shape_id直接一致: このGTFSフィードでは、shape_idが実際の系統番号そのもの
//    （末尾1=往路、末尾2=復路）になっているケースが大半を占める。shape_idが数字
//    のみで末尾が1か2、かつそのshape_idが複数の異なる停車パターンに使い回されて
//    いない（あいまいでない）場合は、これを実系統番号として最優先で採用する。
//    生のGTFSデータそのものに基づく判定であり、過去の停車順データより信頼できる
//    （過去データが古くなって現状と食い違うケース、例えば経由地が1つ増えた
//    枝分かれ系統などにも対応できる）。
// 2. legacyPatterns突き合わせ: shape_idが使えない（非数値・末尾が1/2でない・
//    あいまい）場合のみ、過去の停車順データ（legacyPatterns）と比較して最も
//    一致するものを探すフォールバック判定を行う（完全一致に近いスコアのみ採用）。
//
// 2方向とも確信を持って対応付けられなかった系統は、元のGTFS route_idのまま
// （両方向を便宜上のラベルで内包した形）に残し、呼び出し側で上下区分の手動選択に
// フォールバックできるようにする。
//
// extraCandidatesは、buildStopMaster()が同一route_id・direction_idの中で
// 最頻パターンとして採用しなかった停車順（枝分かれ系統など）。それぞれ独立に
// 上記の優先順位で判定し、一致すればその実系統番号として新たに追加する
// （一致しなければ何もしない＝これまで通り単に捨てられるだけなので、既存の
// 挙動への影響はない）。
export function relabelWithLegacyNumbers(stopMaster, legacyPatterns, extraCandidates = []) {
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

  function directionFromShapeId(shapeId) {
    if (!shapeId || !/^[0-9]+$/.test(shapeId)) return null;
    const last = shapeId[shapeId.length - 1];
    if (last === "1") return "往";
    if (last === "2") return "復";
    return null;
  }

  const relabeled = {};
  const usedNumbers = new Set();

  function claim(num, dir, entry) {
    relabeled[num] = { name: entry.name, directions: { [dir]: entry.direction } };
    usedNumbers.add(num);
  }

  // 実系統番号・方向を解決する（shape_id直接一致を最優先、無ければ旧マスタ突き合わせ）
  function resolveDirect(direction) {
    const shapeDir = directionFromShapeId(direction.shapeId);
    if (shapeDir && !usedNumbers.has(direction.shapeId)) {
      return { num: direction.shapeId, dir: shapeDir, source: "shape" };
    }
    const top = bestMatch(direction.stops);
    if (top && top.score >= CONFIDENT_MATCH_THRESHOLD) {
      const [num, dir] = top.key.split("\t");
      if (!usedNumbers.has(num)) return { num, dir, source: "legacy" };
    }
    return null;
  }

  for (const [routeId, route] of Object.entries(stopMaster)) {
    const dirEntries = Object.entries(route.directions); // [["往", {...}], ["復", {...}]]

    if (dirEntries.length === 1) {
      const [, direction] = dirEntries[0];
      const resolved = resolveDirect(direction);
      if (resolved) {
        claim(resolved.num, resolved.dir, { name: route.name, direction });
        continue;
      }
      relabeled[routeId] = route; // フォールバック: GTFSのroute_idのまま
      continue;
    }

    const [[gLabelA, dirA], [gLabelB, dirB]] = dirEntries;
    const resA = resolveDirect(dirA);
    const resB = resolveDirect(dirB);

    let assignA = null;
    let assignB = null;

    function assignFromAnchor(anchorRes, anchorDirData, otherDirData) {
      const anchorAssign = {
        num: anchorRes.num,
        dir: anchorRes.dir,
        entry: { name: route.name, direction: anchorDirData },
      };
      let otherAssign = null;
      // 相方のshape_idそのものが、anchorの番号の末尾1↔2を入れ替えた番号なら、それを最優先で採用
      const flipped = flipLastDigit(anchorRes.num);
      if (flipped && !usedNumbers.has(flipped)) {
        if (otherDirData.shapeId === flipped) {
          otherAssign = {
            num: flipped,
            dir: directionFromShapeId(flipped),
            entry: { name: route.name, direction: otherDirData },
          };
        } else if (byKey.has(`${flipped}\t往`) || byKey.has(`${flipped}\t復`)) {
          const dir = byKey.has(`${flipped}\t往`) ? "往" : "復";
          otherAssign = { num: flipped, dir, entry: { name: route.name, direction: otherDirData } };
        }
      }
      if (!otherAssign) {
        const otherResolved = resolveDirect(otherDirData);
        if (otherResolved && otherResolved.num !== anchorRes.num) {
          otherAssign = { num: otherResolved.num, dir: otherResolved.dir, entry: { name: route.name, direction: otherDirData } };
        } else {
          const alt = bestMatch(otherDirData.stops, anchorRes.num);
          if (alt && alt.score >= CONFIDENT_MATCH_THRESHOLD) {
            const [num, dir] = alt.key.split("\t");
            otherAssign = { num, dir, entry: { name: route.name, direction: otherDirData } };
          }
        }
      }
      return [anchorAssign, otherAssign];
    }

    if (resA && !resB) {
      [assignA, assignB] = assignFromAnchor(resA, dirA, dirB);
    } else if (resB && !resA) {
      [assignB, assignA] = assignFromAnchor(resB, dirB, dirA);
    } else if (resA && resB) {
      if (resA.num !== resB.num) {
        assignA = { num: resA.num, dir: resA.dir, entry: { name: route.name, direction: dirA } };
        assignB = { num: resB.num, dir: resB.dir, entry: { name: route.name, direction: dirB } };
      } else if (resA.source === "shape" && resB.source !== "shape") {
        assignA = { num: resA.num, dir: resA.dir, entry: { name: route.name, direction: dirA } };
      } else if (resB.source === "shape" && resA.source !== "shape") {
        assignB = { num: resB.num, dir: resB.dir, entry: { name: route.name, direction: dirB } };
      }
      // 両方が同じ番号に解決し、どちらを優先すべきか判断できない場合は、
      // 下のbothResolvedチェックに任せる（片方のみ確定＝フォールバックへ）
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

  for (const candidate of extraCandidates) {
    const resolved = resolveDirect(candidate);
    if (!resolved) continue;
    claim(resolved.num, resolved.dir, {
      name: candidate.name,
      direction: { stops: candidate.stops, distanceKm: candidate.distanceKm, destination: candidate.destination },
    });
  }

  // shape_idは判定用の内部情報なので、最終出力には含めない
  for (const route of Object.values(relabeled)) {
    for (const direction of Object.values(route.directions)) {
      delete direction.shapeId;
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
