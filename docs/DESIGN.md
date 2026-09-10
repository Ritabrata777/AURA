# AURA Web Design System

This is the visual and interaction reference for the AURA web platform. It
describes the product experience, reusable React components, CSS conventions,
and the Apple-inspired Liquid Glass material used across the dashboard.

The interface should feel calm, precise, trustworthy, and quietly premium. AURA
is a health product: readings must be easy to scan, status must be unambiguous,
and decoration must never compete with a person's data.

## Product surfaces

The same visual language is shared across these areas:

| Surface | Primary user | Main job |
| --- | --- | --- |
| Login and role selection | Everyone | Sign in and choose Personal, Patient, or Doctor |
| Personal dashboard | Individual user | See current vitals, device state, and recent activity |
| Devices | Individual user | Pair devices, see connection state, and send commands |
| Vitals and trends | Individual user or patient | Inspect current readings and historical patterns |
| ECG session | Patient or doctor | Watch a live trace and review a completed session |
| Clinic dashboard | Patient or doctor | Review care relationships, appointments, and prescriptions |
| Health companion | Individual user | Ask questions about personal readings with clear safety limits |

## Visual direction

- Use a deep near-black canvas with cool violet and blue atmosphere.
- Use translucent glass surfaces to create hierarchy, not as decoration on every
  element.
- Keep important data high contrast and close to the surface of the page.
- Use green for healthy/connected/active, amber for attention, and red for
  danger or failure. Never communicate state with color alone.
- Prefer compact, information-dense layouts for dashboards and clinical views.
- Use generous spacing and larger type only for the login experience and major
  page headings.
- Avoid marketing-style hero sections inside the authenticated product.

## Color tokens

These values are the source palette. Tailwind opacity utilities may create
derived tints, but new arbitrary colors should not be introduced casually.

| Token | Hex | Use |
| --- | --- | --- |
| `ink-950` | `#121212` | App canvas and kiosk background |
| `ink-900` | `#1C1C1E` | Deep background layer |
| `ink-800` | `#241536` | Violet atmospheric background |
| `surface-glass` | `rgba(255,255,255,0.10)` | Main translucent panels |
| `surface-quiet` | `rgba(255,255,255,0.05)` | Dense cards, inputs, table rows |
| `line-glass` | `rgba(255,255,255,0.15)` | Standard borders |
| `line-bright` | `rgba(255,255,255,0.28)` | Focus and highlighted glass rim |
| `text-primary` | `#FFFFFF` | Headings and primary values |
| `text-secondary` | `rgba(255,255,255,0.70)` | Supporting labels |
| `text-muted` | `rgba(255,255,255,0.45)` | Metadata and hints |
| `violet` | `#8B5CF6` | Primary action, selected state, AI |
| `violet-soft` | `#C4B5FD` | Violet text on dark glass |
| `cyan` | `#22D3EE` | SpO2, device/network information |
| `green` | `#22C55E` | Healthy, connected, active |
| `amber` | `#F59E0B` | Waiting, warning, incomplete |
| `red` | `#EF4444` | Error, offline, destructive action |

### Vital color mapping

- Heart rate: violet or rose accent, with no implication that a value is a
  diagnosis.
- SpO2: cyan.
- Temperature: amber.
- ECG: green for a live signal and muted white when idle.
- Device status: green connected, amber connecting, red offline/error.

## Typography

Use the Geist sans family already configured by the Next.js app. Use the Geist
mono family for IDs, timestamps, protocol values, and diagnostic output.

| Role | Tailwind direction |
| --- | --- |
| Page title | `text-2xl font-bold` |
| Section title | `text-lg font-bold` |
| Card title | `text-sm font-bold` |
| Body | `text-sm text-white/70` |
| Metadata | `text-xs text-white/45` |
| Metric value | `text-2xl font-bold tabular-nums` |
| Eyebrow | `text-[11px] font-bold uppercase tracking-wider` |

Do not use all caps for long sentences. Keep labels short and let values carry
the visual emphasis.

## Layout and responsive behavior

- The app shell is full viewport height with a fixed atmospheric background.
- Content uses a centered container with responsive horizontal padding.
- Desktop dashboards use a 12-column grid; mobile screens collapse to one column.
- Keep cards at a stable size so loading text, icons, and live values do not
  shift neighboring content.
- On mobile, navigation becomes a compact toolbar or drawer; it must not cover
  readings or action buttons.
- Use `rounded-2xl` for dense cards and `rounded-3xl` for primary panels. Avoid
  excessive pill shapes except for status badges and compact filters.

## Core React components

Build pages from these composable pieces instead of repeating one-off markup.

| Component | Responsibility |
| --- | --- |
| `KioskScreen` | Full-screen canvas, background, and base text color |
| `AppShell` | Page heading, role navigation, account actions, responsive frame |
| `GlassPanel` | Primary section container with glass material and rim |
| `GlassCard` | Lightweight repeated item without nested blur layers |
| `VitalCard` | Metric label, current value, unit, freshness, and state |
| `DeviceStatus` | Connection indicator, last-seen time, and readable status text |
| `TrendChart` | Time-series visualization with units, legend, and empty state |
| `EcgSessionDetail` | Live or historical ECG trace and session controls |
| `StatusBadge` | Compact connected, waiting, warning, or error state |
| `EmptyState` | Calm explanation and one clear next action |
| `LoadingState` | Stable skeleton or spinner that preserves layout dimensions |
| `HealthCompanion` | Floating assistant entry point and conversation surface |

Use Lucide React icons inside controls. Every unfamiliar icon-only control must
have an accessible label and a tooltip. Buttons that perform an action should
show an icon plus a short verb when space allows.

## Liquid Glass material

Liquid Glass is a material, not a page theme. Use it on the app shell, primary
panels, navigation, dialogs, and selected interactive surfaces. Use the cheaper
fill-only treatment for dense repeated cards so scrolling stays smooth.

The implementation lives in `web-platform/apps/web/app/globals.css`:

```css
.lg-surface {
  background: linear-gradient(
    135deg,
    rgb(255 255 255 / 0.14),
    rgb(255 255 255 / 0.04) 45%,
    rgb(255 255 255 / 0.08)
  );
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    inset 0 1px 1px rgb(255 255 255 / 0.22),
    0 24px 60px -16px rgb(0 0 0 / 0.55);
}
```

Material rules:

- One blurred glass layer per major surface. Do not stack blur on every child.
- Use a bright top-left rim and a quieter lower rim to suggest refraction.
- Keep content readable over the surface; increase opacity before increasing
  blur.
- Use pointer-following specular highlights only on large interactive panels.
- Respect `prefers-reduced-motion`; glass highlights must become static.
- Use `glassCard` for repeated cards and table rows, not another backdrop blur.

## Interaction and state

Every data component has four states: loading, ready, empty, and error. Live
components also show stale/offline state when the last update is old.

- Hover: raise contrast slightly and reveal the glass rim.
- Focus: use a visible violet or cyan ring; never remove the browser focus cue.
- Pressed: reduce brightness and translate no more than 1px.
- Disabled: lower opacity and explain why the action is unavailable.
- Success: use a short confirmation near the action; do not rely on a toast
  alone for important health or device events.
- Destructive actions require a clear label and confirmation when data may be
  lost.

Charts and live ECG traces should animate only when motion is allowed. Always
show the unit, time range, last update, and an accessible text summary of the
trend. A visual reading is informational, not a medical diagnosis.

## CSS and React conventions

- Use Tailwind utilities for local layout and component styling.
- Use `globals.css` only for shared tokens, material classes, keyframes, and
  browser-wide behavior.
- Keep reusable class combinations in named components such as `glassPanel` and
  `glassCard`; do not copy long glass strings across pages.
- Keep components typed with TypeScript and make state variants explicit.
- Prefer server components by default; add `"use client"` only for interaction,
  browser APIs, live sockets, charts, or animation.
- Use Framer Motion for meaningful transitions, never for decoration that slows
  scanning.
- Keep data fetching and authorization separate from visual components.
- Do not place cards inside cards unless the inner item is a genuinely separate
  repeated object such as a measurement, appointment, or table row.

## Accessibility and trust

- Meet WCAG AA contrast for primary text and controls.
- Provide text labels for every health status and connection state.
- Do not use flashing effects for ECG or live updates.
- Support keyboard navigation and reduced motion.
- Never imply diagnosis, treatment, or clinical certainty through color, copy, or
  animation.
- Keep the health safety disclaimer visible in authenticated health views.

## Quick review checklist

Before merging a visual change, check:

- Does the page still feel calm and data-first at a glance?
- Are loading, empty, offline, and error states designed?
- Does text fit at mobile and desktop widths without overlap?
- Are colors taken from the palette and meaningful for the user's role?
- Is there only one expensive blur layer per major surface?
- Can every action be used with keyboard, screen reader, and reduced motion?
