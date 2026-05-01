"use client"

import AlertButton from "@/components/AlertButton"
import HistoryChart from "@/components/HistoryChart"
import ReadingsTable from "@/components/ReadingsTable"
import RegionalBar from "@/components/RegionalBar"
import RiskBanner from "@/components/RiskBanner"
import TopographicBackdrop from "@/components/TopographicBackdrop"
import { fetchHistory, fetchPredict, fetchReadings, fetchStations } from "@/lib/api"
import { PredictResponse, SensorReading, Station, stationColor } from "@/types"
import { useCallback, useEffect, useState } from "react"

const POLL_INTERVAL = 30_000

export default function DashboardPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [predictions, setPredictions] = useState<(PredictResponse | null)[]>([])
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [history, setHistory] = useState<SensorReading[]>([])

  const [loadingPredict, setLoadingPredict] = useState(true)
  const [loadingReadings, setLoadingReadings] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [online, setOnline] = useState<boolean>(true)

  const refresh = useCallback(async (currentStations: Station[]) => {
    const now  = new Date()
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const to   = now.toISOString()

    // Predict per station, in parallel; readings + history once for everyone.
    const predictPromises = currentStations.length > 0
      ? currentStations.map((s) => fetchPredict(s.station_id).catch(() => null))
      : [fetchPredict().catch(() => null)]

    const [predResults, readingsRes, historyRes] = await Promise.allSettled([
      Promise.all(predictPromises),
      fetchReadings(undefined, 50),
      fetchHistory(from, to),
    ])

    if (predResults.status === "fulfilled") setPredictions(predResults.value)
    setLoadingPredict(false)

    if (readingsRes.status === "fulfilled") setReadings(readingsRes.value)
    setLoadingReadings(false)

    if (historyRes.status === "fulfilled") setHistory(historyRes.value)
    setLoadingHistory(false)

    const anyOk = [predResults, readingsRes, historyRes].some((r) => r.status === "fulfilled")
    setOnline(anyOk)
    setLastUpdated(new Date())
  }, [])

  // Bootstrap: fetch the station list once, then start polling.
  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    ;(async () => {
      let bootstrapStations: Station[] = []
      try {
        bootstrapStations = await fetchStations()
      } catch {
        // /stations unreachable — fall back to "unknown station" mode
        bootstrapStations = []
      }
      if (cancelled) return
      setStations(bootstrapStations)
      await refresh(bootstrapStations)
      intervalId = setInterval(() => refresh(bootstrapStations), POLL_INTERVAL)
    })()

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [refresh])

  const isMulti = stations.length >= 2

  return (
    <>
      <TopographicBackdrop />

      {/* Header */}
      <header className="border-b hairline">
        <div className="max-w-[1240px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between gap-4">
          <div className="reveal reveal-1 flex items-center gap-5">
            <span
              aria-hidden
              className="hidden sm:flex w-10 h-10 items-center justify-center border"
              style={{ borderColor: "var(--copper)" }}
            >
              <span className="font-display text-[18px] leading-none" style={{ color: "var(--copper)" }}>
                ▲
              </span>
            </span>
            <div>
              <p className="sigil mb-1">
                § Field Station · Chiang Mai
                {isMulti && <span className="text-[var(--ink-400)]"> · {stations.length} sites</span>}
              </p>
              <h1 className="font-display text-[22px] sm:text-[26px] leading-none text-[var(--ink-100)]">
                Landslide Warning System
              </h1>
            </div>
          </div>

          <div className="reveal reveal-2 flex items-center gap-4">
            {!isMulti && (
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
            )}
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
              <p className="sigil mb-3">§ Overview</p>
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
                <Stat label="Stations" value={stations.length.toString().padStart(2, "0")} />
                <Stat label="Cadence" value="30s" />
              </div>
            </div>
          </section>

          {/* Regional bar — multi-station only */}
          {isMulti && (
            <section className="reveal reveal-2">
              <RegionalBar
                predictions={predictions}
                totalStations={stations.length}
                lastUpdated={lastUpdated}
                online={online}
              />
            </section>
          )}

          {/* Risk banners */}
          <section
            className={`reveal reveal-2 ${
              isMulti ? "grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8" : ""
            }`}
          >
            {isMulti
              ? stations.map((s, i) => (
                  <RiskBanner
                    key={s.station_id}
                    prediction={predictions[i] ?? null}
                    loading={loadingPredict}
                    compact
                    accent={stationColor(stations, s.station_id).accent}
                    stationLabel={s.station_id.toUpperCase().replace("_", " ")}
                  />
                ))
              : (
                <RiskBanner prediction={predictions[0] ?? null} loading={loadingPredict} />
              )}
          </section>

          {/* Chart + side notes */}
          <section className="reveal reveal-3 grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-6 lg:gap-8">
            <HistoryChart data={history} stations={stations} loading={loadingHistory} />
            <aside className="border hairline p-5 flex flex-col">
              <p className="sigil mb-3">§ Field notes</p>
              <h3 className="font-display text-[18px] leading-tight text-[var(--ink-100)] mb-3">
                Reading the curves
              </h3>
              <p className="text-[13px] text-[var(--ink-300)] leading-relaxed">
                {isMulti
                  ? "Stations on the same hillside should rise and fall together. A divergence — one station saturated while its neighbour stays dry — is a localised signal worth a closer look."
                  : (
                      <>
                        Persistently elevated <span style={{ color: "var(--mineral-blue)" }}>humidity</span> paired
                        with a rising <span style={{ color: "var(--clay)" }}>soil-moisture</span> curve indicates
                        progressive saturation. A spike in <span style={{ color: "var(--sage)" }}>rainfall</span>
                        on top of saturated soil is the dominant precondition for slope failure in this catchment.
                      </>
                    )}
              </p>
              <div className="mt-auto pt-5 border-t hairline">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-400)]">
                  Model Accuracy
                </p>
                <p className="ticker font-display text-[28px] text-[var(--ink-100)] leading-tight mt-1">
                  99.7<span className="text-[14px] text-[var(--ink-400)] ml-1">%</span>
                </p>
                <p className="text-[11px] text-[var(--ink-400)] mt-1 leading-snug">
                  Random Forest · 5 features · 4 risk classes
                </p>
              </div>
            </aside>
          </section>

          {/* Readings ledger */}
          <section className="reveal reveal-4">
            <ReadingsTable readings={readings} stations={stations} loading={loadingReadings} />
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
