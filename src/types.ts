export type Gender = "male" | "female";

export const GENDER_LABEL: Record<Gender, string> = {
  male: "男性",
  female: "女性",
};

// 調査員入力シートの「性別」欄の表記（男／女）
export const GENDER_SHEET_LABEL: Record<Gender, string> = {
  male: "男",
  female: "女",
};

export type Attribute =
  | "elderly" // 高齢者
  | "adult" // 大人
  | "student" // 学生
  | "child" // 小児
  | "adult_disabled" // 大人身障
  | "child_disabled"; // 小児身障

export const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  elderly: "高齢者",
  adult: "大人",
  student: "学生",
  child: "小児",
  adult_disabled: "大人身障",
  child_disabled: "小児身障",
};

export const ATTRIBUTE_ORDER: Attribute[] = [
  "adult",
  "student",
  "child",
  "elderly",
  "adult_disabled",
  "child_disabled",
];

export type PaymentMethod =
  | "cash" // 現金
  | "pass" // 定期券
  | "coupon_ticket" // 回数券
  | "icoca" // ICOCA
  | "shown_ticket"; // 見せ券

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "現金",
  pass: "定期券",
  coupon_ticket: "回数券",
  icoca: "ICOCA",
  shown_ticket: "見せ券",
};

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  "cash",
  "pass",
  "coupon_ticket",
  "icoca",
  "shown_ticket",
];

export type SurveyStatus = "in_progress" | "completed";

export interface Survey {
  id: string;
  date: string; // YYYY-MM-DD
  driverName: string; // 乗務員氏名
  surveyorName: string; // 調査員氏名
  dutyNumber: string; // 仕業番号
  vehicleNumber: string; // 車号
  routeName: string; // 路線名
  routeNumber: string; // 系統番号
  direction: "往" | "復" | null; // 停留所マスタの参照に使う上下区分（同一系統番号で往復両方がある場合のみ意味を持つ）
  originStop: string; // 始発停留所
  originDepartureTime: string; // 始発時刻 HH:MM
  destinationStop: string; // 終着停留所
  destinationArrivalTime: string; // 終着時刻 HH:MM
  routeDistanceKm: number | null; // 系統キロ
  status: SurveyStatus;
  nextPassengerNumber: number;
  currentStopIndex: number; // バス停マスタ利用時の現在位置（マスタ未使用の系統では常に0）
  createdAt: number;
  updatedAt: number;
}

export type PassengerStatus = "onboard" | "alighted";

export interface PassengerRecord {
  id: string;
  surveyId: string;
  passengerNumber: number; // 客番号（乗車No. / 降車No.）
  boardingStopName: string;
  gender: Gender;
  attribute: Attribute; // 料金区分
  boardedAt: number;
  alightingStopName: string | null;
  paymentMethod: PaymentMethod | null; // 支払区分
  fare: number | null; // 区間料金
  alightedAt: number | null;
  status: PassengerStatus;
}
