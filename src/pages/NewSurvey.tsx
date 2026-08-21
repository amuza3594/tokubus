import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSurvey } from "../repository";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function NewSurvey() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [driverName, setDriverName] = useState("");
  const [surveyorName, setSurveyorName] = useState("");
  const [dutyNumber, setDutyNumber] = useState("");
  const [routeNumber, setRouteNumber] = useState("");
  const [originStop, setOriginStop] = useState("");
  const [originDepartureTime, setOriginDepartureTime] = useState(nowTime());
  const [destinationStop, setDestinationStop] = useState("");
  const [routeDistanceKm, setRouteDistanceKm] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = routeNumber.trim() !== "" && originStop.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const survey = await createSurvey({
        date,
        driverName: driverName.trim(),
        surveyorName: surveyorName.trim(),
        dutyNumber: dutyNumber.trim(),
        routeNumber: routeNumber.trim(),
        originStop: originStop.trim(),
        originDepartureTime,
        destinationStop: destinationStop.trim(),
        destinationArrivalTime: "",
        routeDistanceKm: routeDistanceKm ? Number(routeDistanceKm) : null,
      });
      navigate(`/survey/${survey.id}/trip`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <button className="back" onClick={() => navigate(-1)}>
          ← 戻る
        </button>
        <h1>基本情報入力</h1>
      </div>
      <form className="page" onSubmit={handleSubmit}>
        <div className="card">
          <div className="field">
            <label>日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>運転者名</label>
              <input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="運転者名"
              />
            </div>
            <div className="field">
              <label>調査員名</label>
              <input
                value={surveyorName}
                onChange={(e) => setSurveyorName(e.target.value)}
                placeholder="調査員名"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>仕業番号</label>
              <input
                value={dutyNumber}
                onChange={(e) => setDutyNumber(e.target.value)}
                placeholder="例: 12"
              />
            </div>
            <div className="field">
              <label>系統番号 *</label>
              <input
                value={routeNumber}
                onChange={(e) => setRouteNumber(e.target.value)}
                placeholder="例: 3"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>起点バス停 *</label>
            <input
              value={originStop}
              onChange={(e) => setOriginStop(e.target.value)}
              placeholder="起点バス停名"
            />
          </div>
          <div className="field">
            <label>起点発時刻</label>
            <input
              type="time"
              value={originDepartureTime}
              onChange={(e) => setOriginDepartureTime(e.target.value)}
            />
          </div>
          <div className="field">
            <label>終点バス停</label>
            <input
              value={destinationStop}
              onChange={(e) => setDestinationStop(e.target.value)}
              placeholder="終点バス停名"
            />
          </div>
          <div className="field">
            <label>系統キロ (km)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={routeDistanceKm}
              onChange={(e) => setRouteDistanceKm(e.target.value)}
              placeholder="例: 12.5"
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={!canSubmit || saving}>
          調査を開始する
        </button>
      </form>
    </>
  );
}
