import type { MeasurementType } from "./types";

export const VITAL_LABELS: Record<MeasurementType, string> = {
  HEART_RATE: "Heart rate",
  SPO2: "Blood oxygen",
  TEMPERATURE: "Temperature",
};

export const VITAL_TONES: Record<MeasurementType, string> = {
  HEART_RATE: "green",
  SPO2: "blue",
  TEMPERATURE: "orange",
};

export const VITAL_GLYPHS: Record<MeasurementType, string> = {
  HEART_RATE: "♥",
  SPO2: "O2",
  TEMPERATURE: "°",
};

/** Vitals deserve sensible precision: 37.2 °C matters, 37.15 °C is noise. */
export function formatValue(type: MeasurementType, value: number): string {
  if (type === "TEMPERATURE") return value.toFixed(1);
  if (type === "SPO2") return Math.round(value).toString();
  return Math.round(value).toString();
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

/**
 * Describes a reading against the patient's own recent average. Population
 * reference ranges are not used deliberately: the API computes a self-relative
 * baseline, and "normal" for one person is not normal for another.
 */
export function describeDeviation(deviation: number | null): {
  text: string;
  tone: "steady" | "up" | "down" | "unknown";
} {
  if (deviation === null || !Number.isFinite(deviation)) {
    return { text: "No baseline yet", tone: "unknown" };
  }

  const magnitude = Math.abs(deviation);
  if (magnitude < 3) {
    return { text: "Within your usual range", tone: "steady" };
  }

  const direction = deviation > 0 ? "above" : "below";
  return {
    text: `${magnitude.toFixed(1)}% ${direction} your baseline`,
    tone: deviation > 0 ? "up" : "down",
  };
}

export function initialsFromEmail(email: string | undefined): string {
  if (!email) return "??";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "??";
}
