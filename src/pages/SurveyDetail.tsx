import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import db from "../db";
import PassengerEditModal, {
  type PassengerEditResult,
} from "../components/PassengerEditModal";
import { deletePassenger, deleteSurvey, updatePassenger } from "../repository";
import {
  ATTRIBUTE_LABEL,
  GENDER_LABEL,
  PAYMENT_METHOD_LABEL,
  type PassengerRecord,
} from "../types";
import { exportSurveyToExcel, getSurveyExcelBlob } from "../utils/export";

export default function SurveyDetail() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<PassengerRecord | null>(null);
  const [sharing, setSharing] = useState(false);

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

  if (survey === undefined || passengers === undefined) {
    return <div className="page">読み込み中...</div>;
  }
  if (!survey) {
    return <div className="page">調査が見つかりません。</div>;
  }

  async function handleSaveEdit(changes: PassengerEditResult) {
    if (!editing) return;
    await updatePassenger(editing.id, {
      boardingStopName: changes.boardingStopName,
      gender: changes.gender,
      attribute: changes.attribute,
      alightingStopName: changes.alightingStopName,
      paymentMethod: changes.paymentMethod,
      fare: changes.fare,
      status: changes.status,
      alightedAt:
        changes.status === "alighted"
          ? editing.alightedAt ?? Date.now()
          : null,
    });
    setEditing(null);
  }

  async function handleDeleteEdit() {
    if (!editing) return;
    if (confirm(`客番号 ${editing.passengerNumber} を削除しますか？`)) {
      await deletePassenger(editing.id);
      setEditing(null);
    }
  }

  async function handleDeleteSurvey() {
    if (!survey) return;
    if (
      confirm(
        "この調査記録と乗降データを全て削除します。よろしいですか？（元に戻せません）",
      )
    ) {
      await deleteSurvey(survey.id);
      navigate("/", { replace: true });
    }
  }

  async function handleShare() {
    if (!survey || !passengers) return;
    setSharing(true);
    try {
      const { blob, filename } = await getSurveyExcelBlob(survey, passengers);
      const file = new File([blob], filename, { type: blob.type });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: filename,
          text: `${survey.date} 系統${survey.routeNumber || ""} の調査データ`,
        });
      } else {
        // 共有に対応していない環境ではダウンロードにフォールバック
        await exportSurveyToExcel(survey, passengers);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") throw err;
    } finally {
      setSharing(false);
    }
  }

  const missingFareCount = passengers.filter(
    (p) => p.status === "alighted" && p.fare === null,
  ).length;

  return (
    <>
      <div className="top-bar">
        <Link className="back" to="/">
          ← 一覧
        </Link>
        <h1>調査詳細</h1>
        {survey.status === "in_progress" && (
          <Link className="back" to={`/survey/${surveyId}/trip`}>
            記録に戻る
          </Link>
        )}
      </div>

      <div className="page">
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            基本情報
          </div>
          <div className="meta" style={{ lineHeight: 1.8 }}>
            日付: {survey.date}
            <br />
            乗務員: {survey.driverName || "-"}／調査員: {survey.surveyorName || "-"}
            <br />
            仕業番号: {survey.dutyNumber || "-"}／車号: {survey.vehicleNumber || "-"}
            <br />
            路線名: {survey.routeName || "-"}／系統番号: {survey.routeNumber || "-"}
            <br />
            {survey.originStop || "-"}（{survey.originDepartureTime || "-"}） →{" "}
            {survey.destinationStop || "-"}（{survey.destinationArrivalTime || "-"}）
            <br />
            系統キロ: {survey.routeDistanceKm ?? "-"} km
            <br />
            状態:{" "}
            <span
              className={
                "badge " +
                (survey.status === "in_progress" ? "badge-progress" : "badge-done")
              }
            >
              {survey.status === "in_progress" ? "調査中" : "完了"}
            </span>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat-box">
            <div className="num">{passengers.length}</div>
            <div className="lbl">乗車累計</div>
          </div>
          <div className="stat-box">
            <div className="num">
              {passengers.filter((p) => p.status === "alighted").length}
            </div>
            <div className="lbl">降車累計</div>
          </div>
          <div className="stat-box">
            <div className="num">{missingFareCount}</div>
            <div className="lbl">運賃未入力</div>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ marginBottom: 16 }}
          disabled={sharing}
          onClick={() => void handleShare()}
        >
          共有
        </button>

        <div className="section-title">乗降データ（タップで編集）</div>
        {passengers.length === 0 ? (
          <div className="empty-state">乗降データがありません。</div>
        ) : (
          passengers.map((p) => (
            <div
              key={p.id}
              className={
                "passenger-row" + (p.status === "alighted" ? " alighted" : "")
              }
              onClick={() => setEditing(p)}
            >
              <div className="passenger-number">{p.passengerNumber}</div>
              <div className="passenger-info">
                <div className="primary">
                  {GENDER_LABEL[p.gender]}・{ATTRIBUTE_LABEL[p.attribute]}
                  {p.status === "alighted" && p.fare === null && (
                    <span className="badge badge-progress" style={{ marginLeft: 6 }}>
                      運賃未入力
                    </span>
                  )}
                </div>
                <div className="secondary">
                  {p.boardingStopName || "-"} →{" "}
                  {p.alightingStopName || (p.status === "alighted" ? "-" : "乗車中")}
                  {p.paymentMethod
                    ? `／${PAYMENT_METHOD_LABEL[p.paymentMethod]}`
                    : ""}
                  {p.fare !== null ? `／${p.fare}円` : ""}
                </div>
              </div>
            </div>
          ))
        )}

        <button
          className="btn btn-danger"
          style={{ marginTop: 24 }}
          onClick={handleDeleteSurvey}
        >
          この調査記録を削除する
        </button>
      </div>

      {editing && (
        <PassengerEditModal
          passenger={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSaveEdit}
          onDelete={handleDeleteEdit}
        />
      )}
    </>
  );
}
