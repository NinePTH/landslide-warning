"use client"

import { SensorReading, Station, stationColor } from "@/types"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface Props {
  data: SensorReading[]
  stations: Station[]
  loading: boolean
}

type Metric = "soil_moisture" | "rainfall" | "humidity"
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "soil_moisture", label: "Soil Moisture", unit: "%" },
  { key: "rainfall",      label: "Rainfall",      unit: "mm" },
  { key: "humidity",      label: "Humidity",      unit: "%" },
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

interface TooltipEntry {
  dataKey: string
  name: string
  value?: number | null
  color: string
}

interface TooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  unit: string
}

const CustomTooltip = ({ active, payload, label, unit }: TooltipProps) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="border bg-[var(--ink-850)] px-4 py-3 shadow-2xl"
      style={{ borderColor: "var(--rule-strong)" }}
    >
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-400)] mb-2">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-200)]">
              <span
                className="block w-2 h-2"
                style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }}
              />
              {p.name}
            </span>
            <span className="ticker font-display text-[15px] text-[var(--ink-100)]">
              {p.value != null ? p.value.toFixed(1) : "—"}
              <span className="text-[var(--ink-400)] text-[10px] ml-1 font-mono">{unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HistoryChart({ data, stations, loading }: Props) {
  const [metric, setMetric] = useState<Metric>("soil_moisture")
  const meta = METRICS.find((m) => m.key === metric)!

  const chartData = useMemo(() => {
    // Pivot the rows so each row has { time, [station_01]: x, [station_02]: y, ... }
    // Bucket by minute-precision time string so near-simultaneous readings share a row.
    const merged = new Map<string, Record<string, string | number | null>>()
    for (const r of data) {
      const key = formatTime(r.time)
      if (!merged.has(key)) merged.set(key, { time: key })
      const row = merged.get(key)!
      const v = r[metric]
      row[r.station_id] = v
    }
    return Array.from(merged.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
  }, [data, metric])

  return (
    <section className="border hairline">
      <header className="px-5 py-3 border-b hairline flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sigil">§ Telemetry</span>
          <h2 className="font-display text-[20px] text-[var(--ink-100)] leading-none">
            24-hour history
          </h2>
        </div>

        {/* Metric toggle */}
        <div className="flex items-center border hairline-strong">
          {METRICS.map((m, i) => {
            const active = metric === m.key
            return (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${
                  i > 0 ? "border-l hairline" : ""
                } ${
                  active
                    ? "text-[var(--ink-100)] bg-[rgba(232,226,208,0.04)]"
                    : "text-[var(--ink-400)] hover:text-[var(--ink-200)]"
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Station legend */}
      <div className="px-5 py-2 border-b hairline flex items-center gap-4 flex-wrap">
        {stations.map((s) => {
          const c = stationColor(stations, s.station_id)
          return (
            <span
              key={s.station_id}
              className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--ink-300)]"
            >
              <span
                className="block w-2 h-2"
                style={{ background: c.accent, boxShadow: `0 0 6px ${c.accent}` }}
              />
              {s.station_id}
            </span>
          )
        })}
      </div>

      <div className="px-2 sm:px-4 pt-4 pb-2">
        {loading ? (
          <div className="h-[280px] skeleton" />
        ) : data.length === 0 ? (
          <div className="h-[280px] flex flex-col items-center justify-center gap-1">
            <span className="sigil">§ Empty record</span>
            <p className="text-sm text-[var(--ink-400)]">No readings logged in the last 24 hours.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 24, left: 4, bottom: 4 }}>
              <defs>
                {stations.map((s) => {
                  const c = stationColor(stations, s.station_id)
                  return (
                    <linearGradient key={s.station_id} id={`fill-${s.station_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={c.accent} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={c.accent} stopOpacity={0}    />
                    </linearGradient>
                  )
                })}
              </defs>
              <CartesianGrid stroke="var(--grid-line)" vertical />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "var(--ink-400)", fontFamily: "var(--font-mono)" }}
                tickLine={{ stroke: "var(--rule)" }}
                axisLine={{ stroke: "var(--rule)" }}
                interval="preserveStartEnd"
                minTickGap={48}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--ink-400)", fontFamily: "var(--font-mono)" }}
                tickLine={{ stroke: "var(--rule)" }}
                axisLine={{ stroke: "var(--rule)" }}
                domain={["auto", "auto"]}
                width={36}
                label={{
                  value: meta.unit,
                  angle: 0,
                  position: "insideTopLeft",
                  offset: -8,
                  fontSize: 10,
                  fill: "var(--ink-400)",
                }}
              />
              <Tooltip
                content={<CustomTooltip unit={meta.unit} />}
                cursor={{ stroke: "var(--copper)", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
              />
              {stations.map((s) => {
                const c = stationColor(stations, s.station_id)
                return (
                  <Area
                    key={s.station_id}
                    type="monotone"
                    dataKey={s.station_id}
                    name={s.station_id}
                    stroke={c.accent}
                    strokeWidth={1.5}
                    fill={`url(#fill-${s.station_id})`}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: c.accent }}
                    connectNulls
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
