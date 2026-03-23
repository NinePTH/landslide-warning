export interface SensorReading {
  time: string
  station_id: string
  humidity: number | null
  soil_moisture: number | null
  rainfall: number | null
  risk_level: string | null
}

export interface PredictResponse extends SensorReading {
  risk_level: string
}

export type RiskLevel = "low" | "medium" | "high"

export const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low:    { bg: "bg-green-500",  text: "text-green-700",  label: "Low" },
  medium: { bg: "bg-yellow-400", text: "text-yellow-700", label: "Medium" },
  high:   { bg: "bg-red-500",    text: "text-red-700",    label: "High" },
}
