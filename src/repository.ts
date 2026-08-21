import { v4 as uuid } from "uuid";
import db from "./db";
import type {
  Attribute,
  Gender,
  PassengerRecord,
  PaymentMethod,
  Survey,
} from "./types";

export interface NewSurveyInput {
  date: string;
  driverName: string;
  surveyorName: string;
  dutyNumber: string;
  vehicleNumber: string;
  routeName: string;
  routeNumber: string;
  direction: "往" | "復" | null;
  originStop: string;
  originDepartureTime: string;
  destinationStop: string;
  destinationArrivalTime: string;
  routeDistanceKm: number | null;
}

export async function createSurvey(input: NewSurveyInput): Promise<Survey> {
  const now = Date.now();
  const survey: Survey = {
    id: uuid(),
    ...input,
    status: "in_progress",
    nextPassengerNumber: 1,
    currentStopIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.surveys.add(survey);
  return survey;
}

export async function updateSurvey(
  id: string,
  changes: Partial<Omit<Survey, "id">>,
): Promise<void> {
  await db.surveys.update(id, { ...changes, updatedAt: Date.now() });
}

export async function completeSurvey(
  id: string,
  destinationArrivalTime: string,
): Promise<void> {
  await updateSurvey(id, { status: "completed", destinationArrivalTime });
}

export async function deleteSurvey(id: string): Promise<void> {
  await db.transaction("rw", db.surveys, db.passengers, async () => {
    await db.passengers.where("surveyId").equals(id).delete();
    await db.surveys.delete(id);
  });
}

export async function addBoardingPassenger(
  surveyId: string,
  boardingStopName: string,
  gender: Gender,
  attribute: Attribute,
): Promise<PassengerRecord> {
  return db.transaction("rw", db.surveys, db.passengers, async () => {
    const survey = await db.surveys.get(surveyId);
    if (!survey) throw new Error("Survey not found");
    const passengerNumber = survey.nextPassengerNumber;
    const record: PassengerRecord = {
      id: uuid(),
      surveyId,
      passengerNumber,
      boardingStopName,
      gender,
      attribute,
      boardedAt: Date.now(),
      alightingStopName: null,
      paymentMethod: null,
      fare: null,
      alightedAt: null,
      status: "onboard",
    };
    await db.passengers.add(record);
    await db.surveys.update(surveyId, {
      nextPassengerNumber: passengerNumber + 1,
      updatedAt: Date.now(),
    });
    return record;
  });
}

export async function recordAlighting(
  passengerId: string,
  alightingStopName: string,
  paymentMethod: PaymentMethod | null,
  fare: number | null,
): Promise<void> {
  await db.passengers.update(passengerId, {
    alightingStopName,
    paymentMethod,
    fare,
    alightedAt: Date.now(),
    status: "alighted",
  });
}

export async function updatePassenger(
  id: string,
  changes: Partial<Omit<PassengerRecord, "id" | "surveyId">>,
): Promise<void> {
  await db.passengers.update(id, changes);
}

export async function deletePassenger(id: string): Promise<void> {
  await db.passengers.delete(id);
}
