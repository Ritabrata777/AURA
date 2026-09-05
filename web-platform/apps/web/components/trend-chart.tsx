"use client";

import { useMemo } from "react";
import type { MeasurementType, TrendPoint } from "../lib/types";
import { formatValue } from "../lib/format";

interface TrendChartProps {
  points: TrendPoint[];
  type: MeasurementType;
}

const WIDTH = 640;
const HEIGHT = 180;
const PAD_X = 8;
const PAD_Y = 12;

export function TrendChart({ points, type }: TrendChartProps) {
  const geometry = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    let low = Infinity;
    let high = -Infinity;
    for (const point of points) {
      if (point.min < low) low = point.min;
      if (point.max > high) high = point.max;
    }

    let span = high - low;
    if (!Number.isFinite(span) || span < 1e-6) {
      span = Math.max(1, Math.abs(high) * 0.1);
      low -= span / 2;
    }
    const padding = span * 0.1;
    low -= padding;
    span += padding * 2;

    const plotWidth = WIDTH - PAD_X * 2;
    const plotHeight = HEIGHT - PAD_Y * 2;

    const xAt = (index: number) =>
      points.length === 1 ? WIDTH / 2 : PAD_X + (index / (points.length - 1)) * plotWidth;
    const yAt = (value: number) => PAD_Y + plotHeight - ((value - low) / span) * plotHeight;

    const avgLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)} ${yAt(p.avg)}`).join(" ");
    const upper = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)} ${yAt(p.max)}`).join(" ");
    const lower = points
      .map((p, i) => `L${xAt(points.length - 1 - i)} ${yAt(points[points.length - 1 - i].min)}`)
      .join(" ");
    const band = `${upper} ${lower} Z`;

    return { avgLine, band, low, high: low + span };
  }, [points]);

  if (!geometry) {
    return <p className="text-sm text-white/50">No readings in this period yet.</p>;
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="mt-5">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily trend, ${points.length} days`}
        className="block h-[180px] w-full"
      >
        <path d={geometry.band} fill="rgba(34,197,94,0.18)" stroke="none" />
        <path
          d={geometry.avgLine}
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-white/50">
        <span>{new Date(first.day).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        <span>
          {formatValue(type, geometry.low)} – {formatValue(type, geometry.high)}
        </span>
        <span>{new Date(last.day).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}
