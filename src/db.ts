import Dexie, { type EntityTable } from "dexie";
import type { PassengerRecord, Survey } from "./types";
import type { GtfsOverrideRecord } from "./gtfsOverride";

const db = new Dexie("tokubus-survey") as Dexie & {
  surveys: EntityTable<Survey, "id">;
  passengers: EntityTable<PassengerRecord, "id">;
  gtfsOverride: EntityTable<GtfsOverrideRecord, "id">;
};

db.version(1).stores({
  surveys: "id, status, date, createdAt",
  passengers: "id, surveyId, passengerNumber, status",
});

db.version(2).stores({
  surveys: "id, status, date, createdAt",
  passengers: "id, surveyId, passengerNumber, status",
  gtfsOverride: "id",
});

export default db;
