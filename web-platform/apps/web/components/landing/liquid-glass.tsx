"use client";

import {
  useCallback,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

/**
 * Apple-style "Liquid Glass" panel: a translucent, heavily blurred body with a
 * gradient rim (bright top-left, as if lit from there), inner refraction
 * shadows, and an optional specular highlight that glides toward the pointer.
 *
 * `quiet` swaps the backdrop-filter for a fill-only material — use it for any
 * glass that stacks on top of other glass, since nested backdrop-filter layers
 * are the main source of scroll jank in Chromium.
 */
export function LiquidGlass({
  children,
  className = "",
  quiet = false,
  interactive = false,
  style,
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  quiet?: boolean;
  interactive?: boolean;
  style?: CSSProperties;
} & HTMLAttributes<HTMLDivElement>) {
  const trackPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--lg-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    target.style.setProperty("--lg-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  const classes = [
    "lg-border overflow-hidden",
    quiet ? "lg-surface-quiet" : "lg-surface",
    interactive ? "lg-specular" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={style} onPointerMove={interactive ? trackPointer : undefined} {...rest}>
      {children}
    </div>
  );
}

/** Small floating stat pill used across the hero and slides. */
export function GlassChip({
  icon,
  label,
  value,
  accent = "text-violet-300",
  className = "",
  float = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: string;
  className?: string;
  float?: boolean;
}) {
  return (
    <LiquidGlass
      quiet
      className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${float ? "lg-anim-float" : ""} ${className}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 ${accent}`}>
        {icon}
      </span>
      <span className="leading-tight">
        <span className="block text-[10px] font-medium tracking-wide text-white/45 uppercase">{label}</span>
        <span className="block text-sm font-bold text-white/90">{value}</span>
      </span>
    </LiquidGlass>
  );
}
