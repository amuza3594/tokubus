import { useState } from "react";
import {
  ATTRIBUTE_LABEL,
  GENDER_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_ORDER,
  type PassengerRecord,
  type PaymentMethod,
} from "../types";

interface Props {
  passenger: PassengerRecord;
  currentStopName: string;
  onConfirm: (
    alightingStopName: string,
    paymentMethod: PaymentMethod | null,
    fare: number | null,
  ) => void;
  onCancel: () => void;
}

export default function AlightingModal({
  passenger,
  currentStopName,
  onConfirm,
  onCancel,
}: Props) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [fare, setFare] = useState("");
  const [stopName, setStopName] = useState(currentStopName);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          客番号 {passenger.passengerNumber} の降車記録（
          {GENDER_LABEL[passenger.gender]}・
          {ATTRIBUTE_LABEL[passenger.attribute]}／乗車:
          {passenger.boardingStopName}）
        </h2>

        <div className="field">
          <label>降車バス停</label>
          <input value={stopName} onChange={(e) => setStopName(e.target.value)} />
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
          <label>基本区間運賃（円）※後で入力も可</label>
          <input
            type="number"
            inputMode="numeric"
            value={fare}
            onChange={(e) => setFare(e.target.value)}
            placeholder="例: 210"
          />
        </div>

        <div className="btn-group">
          <button className="btn btn-outline" onClick={onCancel}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              onConfirm(
                stopName.trim(),
                paymentMethod,
                fare ? Number(fare) : null,
              )
            }
          >
            降車を記録する
          </button>
        </div>
      </div>
    </div>
  );
}
