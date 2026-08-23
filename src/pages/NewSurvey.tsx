import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { createSurvey } from "../repository";
import {
  DIRECTION_LABEL,
  availableDirections,
  findRoute,
  getRouteDestination,
  getRouteDistanceKm,
  getStopSequence,
  type Direction,
} from "../stopMaster";

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
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [routeName, setRouteName] = useState("");
  const [routeNumber, setRouteNumber] = useState("");
  const [direction, setDirection] = useState<Direction | null>(null);
  const [originStop, setOriginStop] = useState("");
  const [originDepartureTime, setOriginDepartureTime] = useState(nowTime());
  const [destinationStop, setDestinationStop] = useState("");
  const [routeDistanceKm, setRouteDistanceKm] = useState("");
  const [saving, setSaving] = useState(false);

  const lastSurvey = useLiveQuery(
    () => db.surveys.orderBy("createdAt").reverse().first(),
    [],
  );

  function handleCopyPrevious() {
    if (!lastSurvey) return;
    setDriverName(lastSurvey.driverName);
    setSurveyorName(lastSurvey.surveyorName);
    setDutyNumber(lastSurvey.dutyNumber);
    setVehicleNumber(lastSurvey.vehicleNumber);
  }

  const matchedRoute = useMemo(() => findRoute(routeNumber), [routeNumber]);
  const directions = useMemo(() => availableDirections(routeNumber), [routeNumber]);
  const effectiveDirection = direction && directions.includes(direction) ? direction : directions[0] ?? null;
  const stopSequence = useMemo(
    () => getStopSequence(routeNumber, effectiveDirection),
    [routeNumber, effectiveDirection],
  );

  // 系統番号入力時：路線名・起終点・系統キロを、その系統番号の内容に常に合わせて更新する
  // （別の系統番号に入れ直した場合も追従する。手入力で上書きしたい場合は、この後に
  // 各欄を編集すればよい）
  function handleRouteNumberChange(value: string) {
    setRouteNumber(value);
    setDirection(null);
    const route = findRoute(value);
    if (!route) {
      setRouteName("");
      setOriginStop("");
      setDestinationStop("");
      setRouteDistanceKm("");
      return;
    }
    setRouteName(route.name);
    const dirs = availableDirections(value);
    const stops = getStopSequence(value, dirs[0] ?? null);
    if (!stops || stops.length === 0) {
      setOriginStop("");
      setDestinationStop("");
      setRouteDistanceKm("");
      return;
    }
    setOriginStop(stops[0]);
    setDestinationStop(stops[stops.length - 1]);
    const distanceKm = getRouteDistanceKm(value, dirs[0] ?? null);
    setRouteDistanceKm(distanceKm !== null ? String(distanceKm) : "");
  }

  // 上下区分の切り替え：進行方向が変わるので起終点・系統キロは常に入れ替える
  function handleDirectionChange(d: Direction) {
    setDirection(d);
    const stops = getStopSequence(routeNumber, d);
    if (!stops || stops.length === 0) return;
    setOriginStop(stops[0]);
    setDestinationStop(stops[stops.length - 1]);
    const distanceKm = getRouteDistanceKm(routeNumber, d);
    if (distanceKm !== null) setRouteDistanceKm(String(distanceKm));
  }

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
        vehicleNumber: vehicleNumber.trim(),
        routeName: routeName.trim(),
        routeNumber: routeNumber.trim(),
        direction: effectiveDirection,
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
          {lastSurvey && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCopyPrevious}
            >
              前回の入力を引用（乗務員・調査員・仕業番号・車号）
            </button>
          )}
          <div className="field-row">
            <div className="field">
              <label>乗務員氏名</label>
              <input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="乗務員氏名"
              />
            </div>
            <div className="field">
              <label>調査員氏名</label>
              <input
                value={surveyorName}
                onChange={(e) => setSurveyorName(e.target.value)}
                placeholder="調査員氏名"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>仕業番号</label>
              <input
                value={dutyNumber}
                onChange={(e) => setDutyNumber(e.target.value)}
                placeholder="例: 神4"
              />
            </div>
            <div className="field">
              <label>車号</label>
              <input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="例: 1704"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>系統番号 *</label>
            <input
              value={routeNumber}
              onChange={(e) => handleRouteNumberChange(e.target.value)}
              placeholder="例: 2541"
              inputMode="numeric"
              autoFocus
            />
          </div>

          {matchedRoute ? (
            <div className="route-match">
              ✓ バス停マスタと一致: {matchedRoute.name}
              {stopSequence && `（${stopSequence.length}停留所）`}
            </div>
          ) : (
            routeNumber.trim() !== "" && (
              <div className="route-match route-match-none">
                バス停マスタに系統番号 {routeNumber} は見つかりません。以下の項目は手入力になります。
              </div>
            )
          )}

          <div className="field">
            <label>路線名</label>
            <input
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="例: 神山線"
            />
          </div>

          {directions.length > 1 && (
            <div className="field">
              <label>上下区分</label>
              <div className="chip-group">
                {directions.map((d) => {
                  const destination = getRouteDestination(routeNumber, d);
                  return (
                    <button
                      type="button"
                      key={d}
                      className={"chip" + (effectiveDirection === d ? " selected" : "")}
                      onClick={() => handleDirectionChange(d)}
                    >
                      {DIRECTION_LABEL[d]}
                      {destination && `（${destination}ゆき）`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="field">
            <label>始発停留所 *</label>
            <input
              value={originStop}
              onChange={(e) => setOriginStop(e.target.value)}
              placeholder="始発停留所名"
            />
          </div>
          <div className="field">
            <label>始発時刻</label>
            <input
              type="time"
              value={originDepartureTime}
              onChange={(e) => setOriginDepartureTime(e.target.value)}
            />
          </div>
          <div className="field">
            <label>終着停留所</label>
            <input
              value={destinationStop}
              onChange={(e) => setDestinationStop(e.target.value)}
              placeholder="終着停留所名"
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
              placeholder="例: 30.9"
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
