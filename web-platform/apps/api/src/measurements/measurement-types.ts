import { MeasurementType } from "@prisma/client";

export const MEASUREMENT_TYPES = [
  "HEART_RATE",
  "PIEZO_HEART_RATE",
  "MAX30102_HEART_RATE",
  "SPO2",
  "TEMPERATURE",
] as const satisfies readonly MeasurementType[];

export const HEART_RATE_TYPES = [
  "HEART_RATE",
  "PIEZO_HEART_RATE",
  "MAX30102_HEART_RATE",
] as const satisfies readonly MeasurementType[];
