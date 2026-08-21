import {
  ATTRIBUTE_LABEL,
  GENDER_SHEET_LABEL,
  PAYMENT_METHOD_LABEL,
  type PassengerRecord,
  type Survey,
} from "../types";

type Cell = string | number;

const HEADER_LABELS_1 = ["日付", "仕業番号", "車号", "乗務員氏名", "調査員氏名"];
const HEADER_LABELS_2 = [
  "路線名",
  "系統番号",
  "始発停留所",
  "始発時刻",
  "終着停留所",
  "終着時刻",
  "系統キロ",
];
const DATA_HEADER = [
  "停留所名",
  "乗車No.",
  "性別",
  "料金区分",
  "降車No.",
  "支払区分",
  "区間料金",
  "備考",
];

interface SurveyEvent {
  time: number;
  stopName: string;
  kind: "boarding" | "alighting";
  passenger: PassengerRecord;
}

function buildEvents(passengers: PassengerRecord[]): SurveyEvent[] {
  const events: SurveyEvent[] = [];
  for (const p of passengers) {
    events.push({
      time: p.boardedAt,
      stopName: p.boardingStopName,
      kind: "boarding",
      passenger: p,
    });
    if (p.status === "alighted") {
      events.push({
        time: p.alightedAt ?? p.boardedAt,
        stopName: p.alightingStopName ?? "",
        kind: "alighting",
        passenger: p,
      });
    }
  }
  events.sort((a, b) => a.time - b.time || a.passenger.passengerNumber - b.passenger.passengerNumber);
  return events;
}

// 調査員入力シートの慣例：同一停留所が連続する場合、2行目以降の停留所名は空欄にする
function eventRows(passengers: PassengerRecord[]): Cell[][] {
  const events = buildEvents(passengers);
  const rows: Cell[][] = [];
  let lastStopName: string | null = null;
  for (const ev of events) {
    const showStopName = ev.stopName !== lastStopName;
    lastStopName = ev.stopName;
    const p = ev.passenger;
    if (ev.kind === "boarding") {
      rows.push([
        showStopName ? ev.stopName : "",
        p.passengerNumber,
        GENDER_SHEET_LABEL[p.gender],
        ATTRIBUTE_LABEL[p.attribute],
        "",
        "",
        "",
        "",
      ]);
    } else {
      rows.push([
        showStopName ? ev.stopName : "",
        "",
        "",
        "",
        p.passengerNumber,
        p.paymentMethod ? PAYMENT_METHOD_LABEL[p.paymentMethod] : "",
        p.fare ?? "",
        "",
      ]);
    }
  }
  return rows;
}

function surveySheetRows(survey: Survey, passengers: PassengerRecord[]): Cell[][] {
  return [
    ["調査員入力シート"],
    HEADER_LABELS_1,
    [
      survey.date,
      survey.dutyNumber,
      survey.vehicleNumber,
      survey.driverName,
      survey.surveyorName,
    ],
    HEADER_LABELS_2,
    [
      survey.routeName,
      survey.routeNumber,
      survey.originStop,
      survey.originDepartureTime,
      survey.destinationStop,
      survey.destinationArrivalTime,
      survey.routeDistanceKm ?? "",
    ],
    [],
    DATA_HEADER,
    ...eventRows(passengers),
  ];
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "").trim();
  return (cleaned || "調査").slice(0, 31);
}

function uniqueSheetName(base: string, used: Set<string>): string {
  let name = sanitizeSheetName(base);
  let suffix = 2;
  while (used.has(name)) {
    name = sanitizeSheetName(`${base}(${suffix})`);
    suffix += 1;
  }
  used.add(name);
  return name;
}

export async function exportSurveyToExcel(
  survey: Survey,
  passengers: PassengerRecord[],
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(surveySheetRows(survey, passengers));
  XLSX.utils.book_append_sheet(wb, sheet, "調査員入力シート");

  const filename = `調査_${survey.date}_${survey.dutyNumber || survey.routeNumber || "unknown"}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export async function exportAllSurveysToExcel(
  surveys: Survey[],
  passengersBySurveyId: Map<string, PassengerRecord[]>,
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const byDuty = new Map<string, Survey[]>();
  for (const survey of surveys) {
    const key = survey.dutyNumber || "調査";
    const list = byDuty.get(key) ?? [];
    list.push(survey);
    byDuty.set(key, list);
  }

  const used = new Set<string>();
  for (const [dutyKey, dutySurveys] of byDuty) {
    dutySurveys.sort((a, b) => a.createdAt - b.createdAt);
    const multiple = dutySurveys.length > 1;
    dutySurveys.forEach((survey, index) => {
      const passengers = passengersBySurveyId.get(survey.id) ?? [];
      const sheetName = uniqueSheetName(
        multiple ? `${dutyKey}-${index + 1}` : dutyKey,
        used,
      );
      const sheet = XLSX.utils.aoa_to_sheet(surveySheetRows(survey, passengers));
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    });
  }

  XLSX.writeFile(wb, `徳島バス調査データ_全件.xlsx`);
}
