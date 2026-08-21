import type { Borders, Workbook } from "exceljs";
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

// A列:16, B〜G列:11.40, H列:20.00（Excelの列幅単位）
const COLUMN_WIDTHS = [16, 11.4, 11.4, 11.4, 11.4, 11.4, 11.4, 20];

const THIN_BORDER: Borders = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
  diagonal: {},
};

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

function addSurveySheet(
  workbook: Workbook,
  sheetName: string,
  survey: Survey,
  passengers: PassengerRecord[],
) {
  const worksheet = workbook.addWorksheet(sheetName);
  const rows = surveySheetRows(survey, passengers);
  worksheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  worksheet.addRows(rows);

  function border(rowStart: number, rowEnd: number, colStart: number, colEnd: number) {
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        worksheet.getCell(r, c).border = THIN_BORDER;
      }
    }
  }

  // 基本情報（日付〜調査員氏名）
  border(2, 3, 1, 5);
  // 路線情報（路線名〜系統キロ）
  border(4, 5, 1, 7);
  // 乗降データ（見出し＋データ行）
  border(7, rows.length, 1, 8);

  return worksheet;
}

async function buildSurveyWorkbook(
  survey: Survey,
  passengers: PassengerRecord[],
): Promise<Workbook> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  addSurveySheet(workbook, "調査員入力シート", survey, passengers);
  return workbook;
}

async function buildAllSurveysWorkbook(
  surveys: Survey[],
  passengersBySurveyId: Map<string, PassengerRecord[]>,
): Promise<Workbook> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();

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
      addSurveySheet(workbook, sheetName, survey, passengers);
    });
  }

  return workbook;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function surveyExcelFilename(survey: Survey): string {
  return `調査_${survey.date}_${survey.dutyNumber || survey.routeNumber || "unknown"}.xlsx`;
}

export async function getSurveyExcelBlob(
  survey: Survey,
  passengers: PassengerRecord[],
): Promise<{ blob: Blob; filename: string }> {
  const workbook = await buildSurveyWorkbook(survey, passengers);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], { type: XLSX_MIME }),
    filename: surveyExcelFilename(survey),
  };
}

export async function exportSurveyToExcel(
  survey: Survey,
  passengers: PassengerRecord[],
): Promise<void> {
  const { blob, filename } = await getSurveyExcelBlob(survey, passengers);
  downloadBlob(blob, filename);
}

export async function exportAllSurveysToExcel(
  surveys: Survey[],
  passengersBySurveyId: Map<string, PassengerRecord[]>,
): Promise<void> {
  const workbook = await buildAllSurveysWorkbook(surveys, passengersBySurveyId);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  downloadBlob(blob, "徳島バス調査データ_全件.xlsx");
}
