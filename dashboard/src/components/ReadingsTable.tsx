"use client"

import { RISK_TONES, RiskLevel, SensorReading, Station, stationColor } from "@/types"

interface Props {
  readings: SensorReading[]
  stations: Station[]
  loading: boolean
}

const riskTag = (level: string | null) => {
  if (!level) return <span className="font-mono text-[10px] text-[var(--ink-500)]">—</span>
  const tone = RISK_TONES[level as RiskLevel]
  if (!tone) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-300)]">
        {level}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase"
      style={{ color: tone.ink }}
    >
      <span
        className="block w-1.5 h-1.5"
        style={{ background: tone.accent, boxShadow: `0 0 6px ${tone.accent}` }}
      />
      {tone.label}
    </span>
  )
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

export default function ReadingsTable({ readings, stations, loading }: Props) {
  return (
    <section className="border hairline">
      <header
        className="px-5 py-3 border-b hairline flex items-center justify-between"
      >
        <div className="flex items-baseline gap-3">
          <span className="sigil">§ Ledger</span>
          <h2 className="font-display text-[20px] text-[var(--ink-100)] leading-none">
            Latest readings
          </h2>
        </div>
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-400)]">
          {readings.length > 0 ? `${readings.length} entries` : "—"}
        </span>
      </header>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="h-[180px] skeleton m-4" />
        ) : readings.length === 0 ? (
          <div className="h-[160px] flex flex-col items-center justify-center gap-1">
            <span className="sigil">§ No entries</span>
            <p className="text-sm text-[var(--ink-400)]">Readings will appear here once sensors report in.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b hairline">
                <Th>Timestamp</Th>
                <Th>Station</Th>
                <Th align="right">Humidity</Th>
                <Th align="right">Soil M.</Th>
                <Th align="right">Rainfall</Th>
                <Th>Risk</Th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r, i) => {
                const c = stationColor(stations, r.station_id)
                return (
                  <tr
                    key={`${r.station_id}-${r.time}-${i}`}
                    className="row-hover border-b hairline last:border-b-0"
                  >
                    <td className="px-5 py-3 font-mono text-[12px] text-[var(--ink-200)] whitespace-nowrap">
                      {formatTime(r.time)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase px-2 py-0.5"
                        style={{
                          background: c.soft,
                          color: c.accent,
                          border: `1px solid ${c.accent}`,
                          borderRadius: "0",
                        }}
                      >
                        <span
                          className="block w-1.5 h-1.5"
                          style={{ background: c.accent }}
                        />
                        {r.station_id}
                      </span>
                    </td>
                    <Td value={r.humidity} unit="%" />
                    <Td value={r.soil_moisture} unit="%" />
                    <Td value={r.rainfall} unit="mm" />
                    <td className="px-5 py-3">{riskTag(r.risk_level)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-5 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-400)] font-medium ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  )
}

function Td({ value, unit }: { value: number | null; unit: string }) {
  return (
    <td className="px-5 py-3 text-right">
      <span className="ticker font-display text-[16px] text-[var(--ink-100)]">
        {value != null ? value.toFixed(1) : "—"}
      </span>
      <span className="font-mono text-[10px] text-[var(--ink-400)] ml-1">{unit}</span>
    </td>
  )
}
