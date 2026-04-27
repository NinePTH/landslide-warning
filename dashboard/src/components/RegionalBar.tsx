"use client"

import { PredictResponse, RISK_TONES, RiskLevel } from "@/types"

interface Props {
  predictions: (PredictResponse | null)[]
  totalStations: number
  lastUpdated: Date | null
  online: boolean
}

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"]

function worstRisk(predictions: (PredictResponse | null)[]): RiskLevel | null {
  let worst: RiskLevel | null = null
  for (const p of predictions) {
    if (!p) continue
    const lvl = (p.risk_level as RiskLevel) ?? "low"
    if (worst === null || RISK_ORDER.indexOf(lvl) > RISK_ORDER.indexOf(worst)) {
      worst = lvl
    }
  }
  return worst
}

export default function RegionalBar({ predictions, totalStations, lastUpdated, online }: Props) {
  const worst = worstRisk(predictions)
  const tone  = worst ? RISK_TONES[worst] : null

  const countAtWorst = worst
    ? predictions.filter((p) => p && p.risk_level === worst).length
    : 0

  const reporting = predictions.filter((p) => p !== null).length

  return (
    <div
      className="border flex items-center justify-between px-5 lg:px-6 py-2.5 transition-colors"
      style={{
        background: tone?.surface ?? "var(--ink-850)",
        borderColor: tone?.accent ?? "var(--rule-strong)",
        boxShadow: tone ? `0 0 40px -25px ${tone.glow}` : undefined,
      }}
    >
      <div className="flex items-center gap-4 lg:gap-6">
        {/* Worst-risk indicator dot */}
        <span
          className="block w-2 h-2"
          style={{
            background: tone?.accent ?? "var(--ink-500)",
            boxShadow: tone ? `0 0 10px ${tone.accent}` : undefined,
          }}
        />
        <span
          className="font-mono text-[10px] tracking-[0.25em] uppercase"
          style={{ color: tone?.ink ?? "var(--ink-300)" }}
        >
          § Regional
        </span>
        <span className="hidden sm:inline-block w-px h-4 bg-[var(--rule)]" />
        <div className="flex items-baseline gap-2">
          <span
            className="font-display text-[18px] leading-none"
            style={{ color: tone?.ink ?? "var(--ink-200)" }}
          >
            {worst ? tone!.label : "Awaiting telemetry"}
          </span>
          {worst && (
            <span className="font-mono text-[11px] text-[var(--ink-300)]">
              ({countAtWorst} of {totalStations})
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 lg:gap-6 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-400)]">
        <span>
          {reporting} / {totalStations} reporting
        </span>
        <span className="hidden sm:inline-block w-px h-4 bg-[var(--rule)]" />
        <span className="flex items-center gap-2">
          <span
            className="block w-1.5 h-1.5 rounded-full"
            style={{
              background: online ? "var(--sage-soft)" : "var(--terracotta-soft)",
              boxShadow: `0 0 6px ${online ? "var(--sage-glow)" : "var(--terracotta-glow)"}`,
            }}
          />
          {online ? "Network · Online" : "Network · Degraded"}
        </span>
        <span className="hidden md:inline">
          {lastUpdated
            ? `Last poll ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
            : "Initialising"}
        </span>
      </div>
    </div>
  )
}
