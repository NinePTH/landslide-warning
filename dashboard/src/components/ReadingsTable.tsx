"use client"

import { RISK_COLORS, RiskLevel, SensorReading } from "@/types"

interface Props {
  readings: SensorReading[]
  loading: boolean
}

const riskBadge = (level: string | null) => {
  if (!level) return <span className="text-gray-400 text-xs">—</span>
  const colors = RISK_COLORS[level as RiskLevel]
  if (!colors) return <span>{level}</span>
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white ${colors.bg}`}>
      {colors.label}
    </span>
  )
}

export default function ReadingsTable({ readings, loading }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Latest Sensor Readings</h2>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            Loading readings...
          </div>
        ) : readings.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            No readings available
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Station</th>
                <th className="px-5 py-3 font-medium">Humidity (%)</th>
                <th className="px-5 py-3 font-medium">Soil Moisture (%)</th>
                <th className="px-5 py-3 font-medium">Rainfall (mm)</th>
                <th className="px-5 py-3 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {readings.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(r.time).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-800">{r.station_id}</td>
                  <td className="px-5 py-3 text-gray-600">{r.humidity?.toFixed(1) ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{r.soil_moisture?.toFixed(1) ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{r.rainfall?.toFixed(1) ?? "—"}</td>
                  <td className="px-5 py-3">{riskBadge(r.risk_level)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
