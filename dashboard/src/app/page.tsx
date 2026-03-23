"use client"

import AlertButton from "@/components/AlertButton"
import HistoryChart from "@/components/HistoryChart"
import ReadingsTable from "@/components/ReadingsTable"
import RiskBanner from "@/components/RiskBanner"
import { fetchHistory, fetchPredict, fetchReadings } from "@/lib/api"
import { PredictResponse, SensorReading } from "@/types"
import { useCallback, useEffect, useState } from "react"

const POLL_INTERVAL = 30_000 // 30 seconds

export default function DashboardPage() {
  const [prediction, setPrediction] = useState<PredictResponse | null>(null)
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [history, setHistory] = useState<SensorReading[]>([])

  const [loadingPredict, setLoadingPredict] = useState(true)
  const [loadingReadings, setLoadingReadings] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    const now = new Date()
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const to = now.toISOString()

    await Promise.allSettled([
      fetchPredict()
        .then(setPrediction)
        .catch(() => {})
        .finally(() => setLoadingPredict(false)),

      fetchReadings(undefined, 50)
        .then(setReadings)
        .catch(() => {})
        .finally(() => setLoadingReadings(false)),

      fetchHistory(from, to)
        .then(setHistory)
        .catch(() => {})
        .finally(() => setLoadingHistory(false)),
    ])

    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Landslide Warning System</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {lastUpdated
                ? `Last updated: ${lastUpdated.toLocaleTimeString()} · refreshes every 30s`
                : "Loading..."}
            </p>
          </div>
          <AlertButton />
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Risk Level */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Current Risk Level
          </h2>
          <RiskBanner prediction={prediction} loading={loadingPredict} />
        </section>

        {/* Historical Chart */}
        <section>
          <HistoryChart data={history} loading={loadingHistory} />
        </section>

        {/* Readings Table */}
        <section>
          <ReadingsTable readings={readings} loading={loadingReadings} />
        </section>
      </div>
    </main>
  )
}
