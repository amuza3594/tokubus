import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import db from "../db";
import {
  addBoardingPassenger,
  completeSurvey,
  recordAlighting,
} from "../repository";
import {
  ATTRIBUTE_LABEL,
  ATTRIBUTE_ORDER,
  GENDER_LABEL,
  type Attribute,
  type Gender,
  type PassengerRecord,
  type PaymentMethod,
} from "../types";
import AlightingModal from "../components/AlightingModal";

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function SurveyTrip() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const navigate = useNavigate();

  const survey = useLiveQuery(
    () => (surveyId ? db.surveys.get(surveyId) : undefined),
    [surveyId],
  );
  const passengers = useLiveQuery(
    () =>
      surveyId
        ? db.passengers
            .where("surveyId")
            .equals(surveyId)
            .sortBy("passengerNumber")
        : [],
    [surveyId],
  );

  const [currentStop, setCurrentStop] = useState("");
  const [selectedGender, setSelectedGender] = useState<Gender | null>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<Attribute | null>(
    null,
  );
  const [alightingTarget, setAlightingTarget] =
    useState<PassengerRecord | null>(null);
  const [finishing, setFinishing] = useState(false);

  const stopSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (survey?.originStop) set.add(survey.originStop);
    if (survey?.destinationStop) set.add(survey.destinationStop);
    for (const p of passengers ?? []) {
      if (p.boardingStopName) set.add(p.boardingStopName);
      if (p.alightingStopName) set.add(p.alightingStopName);
    }
    return Array.from(set);
  }, [survey, passengers]);

  if (survey === undefined || passengers === undefined) {
    return <div className="page">読み込み中...</div>;
  }
  if (!survey) {
    return <div className="page">調査が見つかりません。</div>;
  }

  const onboard = passengers.filter((p) => p.status === "onboard");
  const alightedCount = passengers.length - onboard.length;

  async function handleAddBoarding() {
    if (!surveyId || !selectedGender || !selectedAttribute) return;
    await addBoardingPassenger(
      surveyId,
      currentStop.trim(),
      selectedGender,
      selectedAttribute,
    );
    setSelectedAttribute(null);
  }

  async function handleAlightConfirm(
    stopName: string,
    paymentMethod: PaymentMethod | null,
    fare: number | null,
  ) {
    if (!alightingTarget) return;
    await recordAlighting(alightingTarget.id, stopName, paymentMethod, fare);
    setAlightingTarget(null);
  }

  async function handleFinish() {
    if (!surveyId) return;
    setFinishing(true);
    try {
      await completeSurvey(surveyId, nowTime());
      navigate(`/survey/${surveyId}`, { replace: true });
    } finally {
      setFinishing(false);
    }
  }

  return (
    <>
      <div className="top-bar">
        <Link className="back" to="/">
          ← 一覧
        </Link>
        <h1>
          系統{survey.routeNumber} ／仕業{survey.dutyNumber}
        </h1>
        <Link className="back" to={`/survey/${surveyId}`}>
          詳細
        </Link>
      </div>

      <div className="page">
        <div className="stat-row">
          <div className="stat-box">
            <div className="num">{onboard.length}</div>
            <div className="lbl">乗車中</div>
          </div>
          <div className="stat-box">
            <div className="num">{passengers.length}</div>
            <div className="lbl">乗車累計</div>
          </div>
          <div className="stat-box">
            <div className="num">{alightedCount}</div>
            <div className="lbl">降車累計</div>
          </div>
        </div>

        <div className="stop-header">
          <div className="label">現在のバス停</div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                value={currentStop}
                onChange={(e) => setCurrentStop(e.target.value)}
                placeholder="停留所名を入力"
                list="stop-suggestions"
              />
            </div>
          </div>
          <datalist id="stop-suggestions">
            {stopSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="card">
          <div className="section-title">乗車を記録</div>
          <div className="field">
            <label>性別</label>
            <div className="chip-group">
              <button
                type="button"
                className={
                  "chip gender-male" +
                  (selectedGender === "male" ? " selected" : "")
                }
                onClick={() => setSelectedGender("male")}
              >
                {GENDER_LABEL.male}
              </button>
              <button
                type="button"
                className={
                  "chip gender-female" +
                  (selectedGender === "female" ? " selected" : "")
                }
                onClick={() => setSelectedGender("female")}
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
                  className={
                    "chip" + (selectedAttribute === a ? " selected" : "")
                  }
                  onClick={() => setSelectedAttribute(a)}
                >
                  {ATTRIBUTE_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={!selectedGender || !selectedAttribute}
            onClick={handleAddBoarding}
          >
            乗車を追加（客番号 {survey.nextPassengerNumber}）
          </button>
        </div>

        <div className="section-title">
          乗車中の客（タップして降車を記録）
        </div>
        {onboard.length === 0 ? (
          <div className="empty-state">現在乗車中の客はいません。</div>
        ) : (
          onboard.map((p) => (
            <div
              key={p.id}
              className="passenger-row"
              onClick={() => setAlightingTarget(p)}
            >
              <div className="passenger-number">{p.passengerNumber}</div>
              <div className="passenger-info">
                <div className="primary">
                  {GENDER_LABEL[p.gender]}・{ATTRIBUTE_LABEL[p.attribute]}
                </div>
                <div className="secondary">乗車: {p.boardingStopName || "-"}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fab-bar">
        <button
          className="btn btn-secondary"
          disabled={finishing}
          onClick={handleFinish}
        >
          調査終了（{survey.destinationStop || "終点"}到着）
        </button>
      </div>

      {alightingTarget && (
        <AlightingModal
          passenger={alightingTarget}
          currentStopName={currentStop}
          onCancel={() => setAlightingTarget(null)}
          onConfirm={handleAlightConfirm}
        />
      )}
    </>
  );
}
