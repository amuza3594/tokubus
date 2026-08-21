export type Gender = "male" | "female";

export const GENDER_LABEL: Record<Gender, string> = {
  male: "男性",
  female: "女性",
};

export type Attribute =
  | "elderly" // 高齢者
  | "adult" // 大人
  | "student" // 学生
  | "child" // 小児
  | "adult_disabled" // 大人障がい者
  | "child_disabled"; // 小児障がい者

export const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  elderly: "高齢者",
  adult: "大人",
  student: "学生",
  child: "小児",
  adult_disabled: "大人障がい者",
  child_disabled: "小児障がい者",
};

export const ATTRIBUTE_ORDER: Attribute[] = [
  "adult",
  "student",
  "child",
  "elderly",
  "adult_disabled",
  "child_disabled",
];

export type PaymentMethod = "ic" | "cash" | "shown_ticket" | "coupon_ticket";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  ic: "IC",
  cash: "現金",
  shown_ticket: "見せ券",
  coupon_ticket: "回数券",
};

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  "ic",
  "cash",
  "shown_ticket",
  "coupon_ticket",
];

export type SurveyStatus = "in_progress" | "completed";

export interface Survey {
  id: string;
  date: string; // YYYY-MM-DD
  driverName: string;
  surveyorName: string;
  dutyNumber: string; // 仕業番号
  routeNumber: string; // 系統番号
  originStop: string; // 起点バス停
  originDepartureTime: string; // HH:MM
  destinationStop: string; // 終点バス停
  destinationArrivalTime: string; // HH:MM
  routeDistanceKm: number | null; // 系統キロ
  status: SurveyStatus;
  nextPassengerNumber: number;
  createdAt: number;
  updatedAt: number;
}

export type PassengerStatus = "onboard" | "alighted";

export interface PassengerRecord {
  id: string;
  surveyId: string;
  passengerNumber: number; // 客番号
  boardingStopName: string;
  gender: Gender;
  attribute: Attribute;
  boardedAt: number;
  alightingStopName: string | null;
  paymentMethod: PaymentMethod | null;
  fare: number | null;
  alightedAt: number | null;
  status: PassengerStatus;
}
