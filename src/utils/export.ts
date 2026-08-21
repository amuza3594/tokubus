import {
  ATTRIBUTE_LABEL,
  GENDER_LABEL,
  PAYMENT_METHOD_LABEL,
  type PassengerRecord,
  type Survey,
} from "../types";

function formatTimestamp(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

const BASIC_INFO_HEADER = [
  "日付",
  "運転者名",
  "調査員名",
  "仕業番号",
  "系統番号",
  "起点バス停",
  "起点発時刻",
  "終点バス停",
  "終点着時刻",
  "系統キロ",
  "状態",
];

function basicInfoRow(survey: Survey): (string | number)[] {
  return [
    survey.date,
    survey.driverName,
    survey.surveyorName,
    survey.dutyNumber,
    survey.routeNumber,
    survey.originStop,
    survey.originDepartureTime,
    survey.destinationStop,
    survey.destinationArrivalTime,
    survey.routeDistanceKm ?? "",
    survey.status === "completed" ? "完了" : "調査中",
  ];
}

const PASSENGER_HEADER = [
  "客番号",
  "乗車バス停",
  "乗車時刻",
  "性別",
  "属性",
  "降車バス停",
  "降車時刻",
  "決済手段",
  "基本区間運賃",
  "状態",
];

function passengerRow(p: PassengerRecord): (string | number)[] {
  return [
    p.passengerNumber,
    p.boardingStopName,
    formatTimestamp(p.boardedAt),
    GENDER_LABEL[p.gender],
    ATTRIBUTE_LABEL[p.attribute],
    p.alightingStopName ?? "",
    formatTimestamp(p.alightedAt),
    p.paymentMethod ? PAYMENT_METHOD_LABEL[p.paymentMethod] : "",
    p.fare ?? "",
    p.status === "alighted" ? "降車済み" : "乗車中",
  ];
}

export async function exportSurveyToExcel(
  survey: Survey,
  passengers: PassengerRecord[],
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const basicSheet = XLSX.utils.aoa_to_sheet([
    BASIC_INFO_HEADER,
    basicInfoRow(survey),
  ]);
  XLSX.utils.book_append_sheet(wb, basicSheet, "基本情報");

  const passengerSheet = XLSX.utils.aoa_to_sheet([
    PASSENGER_HEADER,
    ...passengers.map(passengerRow),
  ]);
  XLSX.utils.book_append_sheet(wb, passengerSheet, "乗降データ");

  const filename = `調査_${survey.date}_系統${survey.routeNumber || "unknown"}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export async function exportAllSurveysToExcel(
  surveys: Survey[],
  passengersBySurveyId: Map<string, PassengerRecord[]>,
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const basicRows = surveys.map(basicInfoRow);
  const basicSheet = XLSX.utils.aoa_to_sheet([BASIC_INFO_HEADER, ...basicRows]);
  XLSX.utils.book_append_sheet(wb, basicSheet, "基本情報一覧");

  const passengerRows: (string | number)[][] = [];
  for (const survey of surveys) {
    const passengers = passengersBySurveyId.get(survey.id) ?? [];
    for (const p of passengers) {
      passengerRows.push([
        survey.date,
        survey.routeNumber,
        survey.dutyNumber,
        ...passengerRow(p),
      ]);
    }
  }
  const passengerSheet = XLSX.utils.aoa_to_sheet([
    ["日付", "系統番号", "仕業番号", ...PASSENGER_HEADER],
    ...passengerRows,
  ]);
  XLSX.utils.book_append_sheet(wb, passengerSheet, "乗降データ一覧");

  XLSX.writeFile(wb, `徳島バス調査データ_全件.xlsx`);
}
