"use client"

import { SensorReading } from "@/types"
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
  loading: boolean
}

const SERIES = [
  { key: "Humidity",      stroke: "var(--mineral-blue)", fillId: "fill-humidity" },
  { key: "Soil Moisture", stroke: "var(--clay)",         fillId: "fill-soil"     },
  { key: "Rainfall",      stroke: "var(--sage)",         fillId: "fill-rain"     },
] as const

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
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
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
              {p.value?.toFixed(1) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HistoryChart({ data, loading }: Props) {
  const chartData = data.map((r) => ({
    time: formatTime(r.time),
    Humidity: r.humidity,
    "Soil Moisture": r.soil_moisture,
    Rainfall: r.rainfall,
  }))

  return (
    <section className="border hairline">
      <header
        className="px-5 py-3 border-b hairline flex items-center justify-between"
      >
        <div className="flex items-baseline gap-3">
          <span className="sigil">§ 03 · Telemetry</span>
          <h2 className="font-display text-[20px] text-[var(--ink-100)] leading-none">
            24-hour history
          </h2>
        </div>
        <div className="flex items-center gap-4">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--ink-300)]">
              <span
                className="block w-2 h-2"
                style={{ background: s.stroke, boxShadow: `0 0 6px ${s.stroke}` }}
              />
              {s.key}
            </span>
          ))}
        </div>
      </header>

      <div className="px-2 sm:px-4 pt-4 pb-2">
        {loading ? (
          <div className="h-[280px] skeleton" />
        ) : data.length === 0 ? (
          <div className="h-[280px] flex flex-col items-center justify-center gap-1">
            <span className="sigil">§ Empty record</span>
            <p className="text-sm text-[var(--ink-400)]">No readings logged in the last 24 hours.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 24, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="fill-humidity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--mineral-blue)" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="var(--mineral-blue)" stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="fill-soil" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--clay)" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="var(--clay)" stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="fill-rain" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--sage)" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="var(--sage)" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid-line)" vertical={true} />
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
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--copper)", strokeOpacity: 0.4, strokeDasharray: "3 3" }} />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.stroke}
                  strokeWidth={1.5}
                  fill={`url(#${s.fillId})`}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: s.stroke }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
