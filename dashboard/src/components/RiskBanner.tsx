"use client"

import { PredictResponse, RISK_TONES, RiskLevel } from "@/types"

interface Props {
  prediction: PredictResponse | null
  loading: boolean
  /**
   * When true, the inner two-column grid collapses to a single column and the
   * display number is reduced. Use this when rendering two banners side-by-side.
   */
  compact?: boolean
  /**
   * Station palette colour. Rendered as a thin top edge so the operator can
   * tell two side-by-side panels apart at a glance even when both show the
   * same risk level.
   */
  accent?: string
  /**
   * Pre-formatted station label (e.g. "STATION 02"). Falls back to the
   * `prediction.station_id` if omitted.
   */
  stationLabel?: string
}

export default function RiskBanner({
  prediction,
  loading,
  compact = false,
  accent,
  stationLabel,
}: Props) {
  if (loading) {
    return (
      <div className="skeleton h-[260px] border border-[var(--rule)]" />
    )
  }

  if (!prediction) {
    return (
      <div className="border border-[var(--rule)] h-[260px] flex flex-col items-center justify-center gap-2">
        <span className="sigil">§ Awaiting telemetry</span>
        <p className="text-[var(--ink-300)] text-sm">
          {stationLabel ? `${stationLabel} has not reported yet.` : "No prediction data available."}
        </p>
      </div>
    )
  }

  const level = (prediction.risk_level as RiskLevel) ?? "low"
  const tone = RISK_TONES[level] ?? RISK_TONES.low
  const sweepClass =
    level === "critical" ? "risk-sweep risk-sweep-critical"
      : level === "high" ? "risk-sweep"
      : ""

  return (
    <article
      className={`relative border ${sweepClass}`}
      style={{
        background: tone.surface,
        borderColor: tone.accent,
        boxShadow: `0 0 60px -20px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.02)`,
      }}
    >
      {/* Station accent strip — visible only in compact (multi-station) mode */}
      {compact && accent && (
        <span
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
        />
      )}

      {/* Header strip */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <div className="flex items-center gap-3">
          {accent ? (
            <span
              className="block w-1.5 h-1.5"
              style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
            />
          ) : (
            <span
              className="block w-1.5 h-1.5"
              style={{ background: tone.accent, boxShadow: `0 0 12px ${tone.accent}` }}
            />
          )}
          <span
            className="font-mono text-[10px] tracking-[0.25em] uppercase"
            style={{ color: accent ?? tone.ink }}
          >
            {stationLabel ?? prediction.station_id.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-300)]">
            Live · 30s poll
          </span>
        </div>
      </header>

      <div className={compact ? "" : "grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]"}>
        {/* Hero — risk level */}
        <div
          className={`px-6 lg:px-8 py-6 lg:py-8 ${
            compact ? "" : "border-b lg:border-b-0 lg:border-r hairline"
          }`}
        >
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sigil">§ Current Risk</span>
            <span className="font-mono text-[10px] text-[var(--ink-400)] tracking-wider">
              {tone.code}
            </span>
          </div>

          <h1
            className={`font-display leading-[0.92] font-light tracking-tight ${
              compact
                ? "text-[44px] sm:text-[56px]"
                : "text-[68px] sm:text-[88px]"
            }`}
            style={{ color: tone.ink }}
          >
            {tone.label}
            <span style={{ color: tone.accent }}>.</span>
          </h1>

          <p
            className={`font-display italic text-[var(--ink-200)] mt-3 max-w-md leading-snug ${
              compact ? "text-[15px]" : "text-lg"
            }`}
          >
            {tone.caption}
          </p>

          <div className="flex items-center gap-4 mt-5 text-[var(--ink-400)] font-mono text-[11px] tracking-wider">
            <span>
              UPDATED&nbsp;
              <span className="text-[var(--ink-200)]">
                {new Date(prediction.time).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </span>
          </div>
        </div>

        {/* Metrics — instrument cluster */}
        <div
          className={`px-6 lg:px-8 py-6 lg:py-8 flex flex-col justify-between ${
            compact ? "border-t hairline" : ""
          }`}
        >
          <div className="flex items-baseline justify-between mb-4">
            <span className="sigil">§ Sensors</span>
            <span className="font-mono text-[10px] text-[var(--ink-400)]">3 · ACTIVE</span>
          </div>

          <div className="space-y-4">
            <Dial label="Humidity" value={prediction.humidity} unit="%" max={100} accent={tone.accent} />
            <Dial label="Soil Moisture" value={prediction.soil_moisture} unit="%" max={100} accent={tone.accent} />
            <Dial label="Rainfall" value={prediction.rainfall} unit="mm" max={300} accent={tone.accent} />
          </div>

          {/* Geographic config */}
          <div className="mt-6 pt-4 border-t hairline grid grid-cols-2 gap-4">
            <Spec label="Slope Angle" value={prediction.slope_angle} unit="°" />
            <Spec label="Water Proximity" value={prediction.proximity_to_water} unit="km" />
          </div>
        </div>
      </div>
    </article>
  )
}

function Dial({
  label,
  value,
  unit,
  max,
  accent,
}: {
  label: string
  value: number | null
  unit: string
  max: number
  accent: string
}) {
  const displayValue = value != null ? value.toFixed(1) : "—"
  const pct = value != null ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-300)]">
          {label}
        </span>
        <span className="ticker font-display text-[26px] leading-none text-[var(--ink-100)]">
          {displayValue}
          <span className="text-[var(--ink-400)] text-[13px] ml-1">{unit}</span>
        </span>
      </div>
      <div className="h-[2px] bg-[var(--ink-700)] relative overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: accent,
            boxShadow: `0 0 8px ${accent}`,
          }}
        />
      </div>
    </div>
  )
}

function Spec({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-400)]">{label}</p>
      <p className="ticker font-display text-[20px] leading-tight text-[var(--ink-100)] mt-0.5">
        {value != null ? value.toFixed(1) : "—"}
        <span className="text-[var(--ink-400)] text-[12px] ml-1">{unit}</span>
      </p>
    </div>
  )
}
