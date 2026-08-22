import Dexie, { type EntityTable } from "dexie";
import type { PassengerRecord, Survey } from "./types";

const db = new Dexie("tokubus-survey") as Dexie & {
  surveys: EntityTable<Survey, "id">;
  passengers: EntityTable<PassengerRecord, "id">;
};

db.version(1).stores({
  surveys: "id, status, date, createdAt",
  passengers: "id, surveyId, passengerNumber, status",
});

export default db;
