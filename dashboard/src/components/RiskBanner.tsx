"use client"

import { PredictResponse, RISK_TONES, RiskLevel } from "@/types"

interface Props {
  prediction: PredictResponse | null
  loading: boolean
}

export default function RiskBanner({ prediction, loading }: Props) {
  if (loading) {
    return (
      <div className="skeleton h-[260px] border border-[var(--rule)]" />
    )
  }

  if (!prediction) {
    return (
      <div className="border border-[var(--rule)] h-[260px] flex flex-col items-center justify-center gap-2">
        <span className="sigil">§ Awaiting telemetry</span>
        <p className="text-[var(--ink-300)] text-sm">No prediction data available.</p>
      </div>
    )
  }

  const level = (prediction.risk_level as RiskLevel) ?? "low"
  const tone = RISK_TONES[level] ?? RISK_TONES.low
  const isHigh = level === "high"

  return (
    <article
      className={`relative border ${isHigh ? "risk-sweep" : ""}`}
      style={{
        background: tone.surface,
        borderColor: tone.accent,
        boxShadow: `0 0 60px -20px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.02)`,
      }}
    >
      {/* Header strip */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="block w-1.5 h-1.5"
            style={{ background: tone.accent, boxShadow: `0 0 12px ${tone.accent}` }}
          />
          <span
            className="font-mono text-[10px] tracking-[0.25em] uppercase"
            style={{ color: tone.ink }}
          >
            {tone.code}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-300)]">
            Live · 30s poll
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        {/* Hero — risk level */}
        <div className="px-6 lg:px-8 py-6 lg:py-8 border-b lg:border-b-0 lg:border-r hairline">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sigil">§ 01 · Current Risk</span>
            <span className="font-mono text-[10px] text-[var(--ink-400)] tracking-wider">
              {prediction.station_id.toUpperCase()}
            </span>
          </div>

          <h1
            className="font-display text-[68px] sm:text-[88px] leading-[0.92] font-light tracking-tight"
            style={{ color: tone.ink }}
          >
            {tone.label}
            <span style={{ color: tone.accent }}>.</span>
          </h1>

          <p className="font-display italic text-[var(--ink-200)] text-lg mt-3 max-w-md leading-snug">
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
                  year: "numeric",
                })}
              </span>
            </span>
          </div>
        </div>

        {/* Metrics — instrument cluster */}
        <div className="px-6 lg:px-8 py-6 lg:py-8 flex flex-col justify-between">
          <div className="flex items-baseline justify-between mb-4">
            <span className="sigil">§ 02 · Sensor Cluster</span>
            <span className="font-mono text-[10px] text-[var(--ink-400)]">3 · ACTIVE</span>
          </div>

          <div className="space-y-4">
            <Dial label="Humidity" value={prediction.humidity} unit="%" max={100} accent={tone.accent} />
            <Dial label="Soil Moisture" value={prediction.soil_moisture} unit="%" max={100} accent={tone.accent} />
            <Dial label="Rainfall" value={prediction.rainfall} unit="mm" max={50} accent={tone.accent} />
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
        <span className="ticker font-display text-[28px] leading-none text-[var(--ink-100)]">
          {displayValue}
          <span className="text-[var(--ink-400)] text-[14px] ml-1">{unit}</span>
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
