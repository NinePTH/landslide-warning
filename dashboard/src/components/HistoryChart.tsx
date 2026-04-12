"use client"

import { SensorReading } from "@/types"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface Props {
  data: SensorReading[]
  loading: boolean
}

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
    <div className="bg-white border border-gray-200 rounded-lg shadow p-3 text-xs">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value?.toFixed(1)}
        </p>
      ))}
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">24-Hour History</h2>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-56 text-sm text-gray-400">
            Loading chart...
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-sm text-gray-400">
            No historical data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="Humidity"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Soil Moisture"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Rainfall"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
