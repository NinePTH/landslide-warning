"use client"

import { PredictResponse, RISK_COLORS, RiskLevel } from "@/types"

interface Props {
  prediction: PredictResponse | null
  loading: boolean
}

export default function RiskBanner({ prediction, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl bg-gray-200 animate-pulse h-28 flex items-center justify-center">
        <span className="text-gray-400 text-sm">Loading risk level...</span>
      </div>
    )
  }

  if (!prediction) {
    return (
      <div className="rounded-xl bg-gray-100 border border-gray-200 h-28 flex items-center justify-center">
        <span className="text-gray-400 text-sm">No prediction data available</span>
      </div>
    )
  }

  const level = (prediction.risk_level as RiskLevel) ?? "low"
  const colors = RISK_COLORS[level] ?? RISK_COLORS.low
  const isHigh = level === "high"

  return (
    <div
      className={`rounded-xl p-5 text-white shadow-md ${colors.bg} ${isHigh ? "animate-pulse" : ""}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-medium opacity-80">Station: {prediction.station_id}</p>
          <p className="text-3xl font-bold tracking-wide mt-1">
            {colors.label.toUpperCase()} RISK
          </p>
          <p className="text-sm opacity-70 mt-1">
            {new Date(prediction.time).toLocaleString()}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Metric label="Humidity" value={prediction.humidity} unit="%" />
          <Metric label="Soil Moisture" value={prediction.soil_moisture} unit="%" />
          <Metric label="Rainfall" value={prediction.rainfall} unit="mm" />
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="bg-white/20 rounded-lg px-3 py-2">
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-xl font-semibold">
        {value != null ? `${value.toFixed(1)}${unit}` : "—"}
      </p>
    </div>
  )
}
