import { useState } from "react";
import {
  ATTRIBUTE_LABEL,
  ATTRIBUTE_ORDER,
  GENDER_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_ORDER,
  type Attribute,
  type Gender,
  type PassengerRecord,
  type PaymentMethod,
} from "../types";

export interface PassengerEditResult {
  boardingStopName: string;
  gender: Gender;
  attribute: Attribute;
  alightingStopName: string | null;
  paymentMethod: PaymentMethod | null;
  fare: number | null;
  status: "onboard" | "alighted";
}

interface Props {
  passenger: PassengerRecord;
  onSave: (changes: PassengerEditResult) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function PassengerEditModal({
  passenger,
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const [boardingStopName, setBoardingStopName] = useState(
    passenger.boardingStopName,
  );
  const [gender, setGender] = useState<Gender>(passenger.gender);
  const [attribute, setAttribute] = useState<Attribute>(passenger.attribute);
  const [alighted, setAlighted] = useState(passenger.status === "alighted");
  const [alightingStopName, setAlightingStopName] = useState(
    passenger.alightingStopName ?? "",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    passenger.paymentMethod,
  );
  const [fare, setFare] = useState(
    passenger.fare !== null ? String(passenger.fare) : "",
  );

  function handleSave() {
    onSave({
      boardingStopName: boardingStopName.trim(),
      gender,
      attribute,
      alightingStopName: alighted ? alightingStopName.trim() || null : null,
      paymentMethod: alighted ? paymentMethod : null,
      fare: alighted && fare ? Number(fare) : null,
      status: alighted ? "alighted" : "onboard",
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>客番号 {passenger.passengerNumber} を編集</h2>

        <div className="field">
          <label>乗車バス停</label>
          <input
            value={boardingStopName}
            onChange={(e) => setBoardingStopName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>性別</label>
          <div className="chip-group">
            <button
              type="button"
              className={"chip gender-male" + (gender === "male" ? " selected" : "")}
              onClick={() => setGender("male")}
            >
              {GENDER_LABEL.male}
            </button>
            <button
              type="button"
              className={
                "chip gender-female" + (gender === "female" ? " selected" : "")
              }
              onClick={() => setGender("female")}
            >
              {GENDER_LABEL.female}
            </button>
          </div>
        </div>

        <div className="field">
          <label>属性</label>
          <div className="chip-group">
            {ATTRIBUTE_ORDER.map((a) => (
              <button
                type="button"
                key={a}
                className={"chip" + (attribute === a ? " selected" : "")}
                onClick={() => setAttribute(a)}
              >
                {ATTRIBUTE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>状態</label>
          <div className="chip-group">
            <button
              type="button"
              className={"chip" + (!alighted ? " selected" : "")}
              onClick={() => setAlighted(false)}
            >
              乗車中
            </button>
            <button
              type="button"
              className={"chip" + (alighted ? " selected" : "")}
              onClick={() => setAlighted(true)}
            >
              降車済み
            </button>
          </div>
        </div>

        {alighted && (
          <>
            <div className="field">
              <label>降車バス停</label>
              <input
                value={alightingStopName}
                onChange={(e) => setAlightingStopName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>決済手段</label>
              <div className="chip-group">
                {PAYMENT_METHOD_ORDER.map((pm) => (
                  <button
                    type="button"
                    key={pm}
                    className={
                      "chip" + (paymentMethod === pm ? " selected" : "")
                    }
                    onClick={() =>
                      setPaymentMethod(paymentMethod === pm ? null : pm)
                    }
                  >
                    {PAYMENT_METHOD_LABEL[pm]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>基本区間運賃（円）</label>
              <input
                type="number"
                inputMode="numeric"
                value={fare}
                onChange={(e) => setFare(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="btn-group">
          <button className="btn btn-danger" onClick={onDelete}>
            削除
          </button>
          <button className="btn btn-outline" onClick={onCancel}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
