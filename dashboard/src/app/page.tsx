"use client"

import AlertButton from "@/components/AlertButton"
import HistoryChart from "@/components/HistoryChart"
import ReadingsTable from "@/components/ReadingsTable"
import RiskBanner from "@/components/RiskBanner"
import TopographicBackdrop from "@/components/TopographicBackdrop"
import { fetchHistory, fetchPredict, fetchReadings } from "@/lib/api"
import { PredictResponse, SensorReading } from "@/types"
import { useCallback, useEffect, useState } from "react"

const POLL_INTERVAL = 30_000

export default function DashboardPage() {
  const [prediction, setPrediction] = useState<PredictResponse | null>(null)
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [history, setHistory] = useState<SensorReading[]>([])

  const [loadingPredict, setLoadingPredict] = useState(true)
  const [loadingReadings, setLoadingReadings] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [online, setOnline] = useState<boolean>(true)

  const refresh = useCallback(async () => {
    const now = new Date()
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const to = now.toISOString()

    const results = await Promise.allSettled([
      fetchPredict()
        .then(setPrediction)
        .finally(() => setLoadingPredict(false)),
      fetchReadings(undefined, 50)
        .then(setReadings)
        .finally(() => setLoadingReadings(false)),
      fetchHistory(from, to)
        .then(setHistory)
        .finally(() => setLoadingHistory(false)),
    ])

    setOnline(results.some((r) => r.status === "fulfilled"))
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <>
      <TopographicBackdrop />

      {/* Header */}
      <header className="border-b hairline">
        <div className="max-w-[1240px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between gap-4">
          <div className="reveal reveal-1 flex items-center gap-5">
            {/* Crest mark */}
            <span
              aria-hidden
              className="hidden sm:flex w-10 h-10 items-center justify-center border"
              style={{ borderColor: "var(--copper)" }}
            >
              <span
                className="font-display text-[18px] leading-none"
                style={{ color: "var(--copper)" }}
              >
                ▲
              </span>
            </span>
            <div>
              <p className="sigil mb-1">§ Field Station · Chiang Mai</p>
              <h1 className="font-display text-[22px] sm:text-[26px] leading-none text-[var(--ink-100)]">
                Landslide Warning System
              </h1>
            </div>
          </div>

          <div className="reveal reveal-2 flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-400)]">
                {online ? "Network · Online" : "Network · Degraded"}
              </span>
              <span className="font-mono text-[11px] text-[var(--ink-200)] mt-0.5">
                {lastUpdated
                  ? `Last poll ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Initialising…"}
              </span>
            </div>
            <AlertButton />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-[1240px] mx-auto px-6 lg:px-10 py-8 lg:py-12 space-y-10">
          {/* Editorial intro */}
          <section className="reveal reveal-1 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 lg:gap-12 pb-2">
            <div>
              <p className="sigil mb-3">§ 00 · Overview</p>
              <h2 className="font-display font-light text-[clamp(28px,4vw,46px)] leading-[1.05] text-[var(--ink-100)] tracking-tight">
                A quiet instrument
                <span className="italic text-[var(--ink-300)]">,</span>
                <br />
                listening to the slope.
              </h2>
            </div>
            <div className="border-l hairline-strong pl-6 lg:pl-8 flex flex-col justify-end">
              <p className="text-[var(--ink-200)] leading-relaxed text-[15px] max-w-md">
                Telemetry from in-situ sensors is fed continuously into a learned classifier. Risk is
                published below; alerts are dispatched on demand to a Discord webhook.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-4 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-400)]">
                <Stat label="Sensors" value="03" />
                <Stat label="Stations" value="01" />
                <Stat label="Cadence" value="30s" />
              </div>
            </div>
          </section>

          {/* Risk banner */}
          <section className="reveal reveal-2">
            <RiskBanner prediction={prediction} loading={loadingPredict} />
          </section>

          {/* Chart + side notes */}
          <section className="reveal reveal-3 grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-6 lg:gap-8">
            <HistoryChart data={history} loading={loadingHistory} />
            <aside className="border hairline p-5 flex flex-col">
              <p className="sigil mb-3">§ Field notes</p>
              <h3 className="font-display text-[18px] leading-tight text-[var(--ink-100)] mb-3">
                Reading the curves
              </h3>
              <p className="text-[13px] text-[var(--ink-300)] leading-relaxed">
                Persistently elevated <span style={{ color: "var(--mineral-blue)" }}>humidity</span>{" "}
                paired with a rising{" "}
                <span style={{ color: "var(--clay)" }}>soil-moisture</span> curve indicates
                progressive saturation. A spike in{" "}
                <span style={{ color: "var(--sage)" }}>rainfall</span> on top of saturated soil is
                the dominant precondition for slope failure in this catchment.
              </p>
              <div className="mt-auto pt-5 border-t hairline">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-400)]">
                  Threshold
                </p>
                <p className="ticker font-display text-[28px] text-[var(--ink-100)] leading-tight mt-1">
                  ≥ 80<span className="text-[14px] text-[var(--ink-400)] ml-1">% RH</span>
                </p>
                <p className="text-[11px] text-[var(--ink-400)] mt-1 leading-snug">
                  Humidity rule layer elevates risk one level when crossed.
                </p>
              </div>
            </aside>
          </section>

          {/* Readings ledger */}
          <section className="reveal reveal-4">
            <ReadingsTable readings={readings} loading={loadingReadings} />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t hairline mt-6">
        <div className="max-w-[1240px] mx-auto px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-400)]">
          <span>Landslide Warning System · Field Station Edition</span>
          <span>Edge inference · TimescaleDB · KNN / Random Forest</span>
        </div>
      </footer>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--ink-400)]">{label}</p>
      <p className="ticker font-display text-[24px] text-[var(--ink-100)] leading-tight mt-1">
        {value}
      </p>
    </div>
  )
}
