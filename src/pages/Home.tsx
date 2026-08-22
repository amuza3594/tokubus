import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import db from "../db";
import { exportAllSurveysToExcel } from "../utils/export";
import type { PassengerRecord } from "../types";

function formatDate(date: string) {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Home() {
  const surveys = useLiveQuery(
    () => db.surveys.orderBy("createdAt").reverse().toArray(),
    [],
  );

  async function handleExportAll() {
    if (!surveys || surveys.length === 0) return;
    const allPassengers = await db.passengers.toArray();
    const bySurvey = new Map<string, PassengerRecord[]>();
    for (const p of allPassengers) {
      const list = bySurvey.get(p.surveyId) ?? [];
      list.push(p);
      bySurvey.set(p.surveyId, list);
    }
    exportAllSurveysToExcel(surveys, bySurvey);
  }

  return (
    <>
      <div className="top-bar">
        <h1>徳島バス 系統実態調査</h1>
        <Link className="back settings-icon" to="/settings" aria-label="設定">
          ⚙
        </Link>
      </div>
      <div className="page">
        {surveys && surveys.length > 0 && (
          <button
            className="btn btn-outline"
            style={{ marginBottom: 16 }}
            onClick={handleExportAll}
          >
            全調査をExcel出力
          </button>
        )}
        {surveys === undefined ? null : surveys.length === 0 ? (
          <div className="empty-state">
            まだ調査記録がありません。
            <br />
            「新規調査を開始」から始めてください。
          </div>
        ) : (
          <ul className="survey-list">
            {surveys.map((s) => (
              <li key={s.id}>
                <Link
                  className="survey-item"
                  to={
                    s.status === "in_progress"
                      ? `/survey/${s.id}/trip`
                      : `/survey/${s.id}`
                  }
                >
                  <div className="route">
                    {formatDate(s.date)} 系統{s.routeNumber || "未設定"} ／
                    仕業{s.dutyNumber || "未設定"}
                  </div>
                  <div className="meta">
                    {s.originStop || "起点未設定"} → {s.destinationStop || "終点未設定"}
                    ・調査員: {s.surveyorName || "未設定"}
                  </div>
                  <span
                    className={
                      "badge " +
                      (s.status === "in_progress"
                        ? "badge-progress"
                        : "badge-done")
                    }
                  >
                    {s.status === "in_progress" ? "調査中" : "完了"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="fab-bar">
        <Link to="/new" className="btn btn-primary">
          ＋ 新規調査を開始
        </Link>
      </div>
    </>
  );
}
