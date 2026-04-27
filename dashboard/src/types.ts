export interface SensorReading {
  time: string
  station_id: string
  humidity: number | null
  soil_moisture: number | null
  rainfall: number | null
  risk_level: string | null
  slope_angle?: number
  proximity_to_water?: number
}

export interface PredictResponse extends SensorReading {
  risk_level: string
  slope_angle: number
  proximity_to_water: number
}

export interface Station {
  station_id: string
}

/**
 * Ordered station palette — assigned by index in the sorted stations list.
 * Stable while the station set is stable. Wraps modulo if more stations
 * appear than colours.
 */
export const STATION_PALETTE = [
  { accent: "#5E8AA6", soft: "rgba(94, 138, 166, 0.12)", name: "mineral-blue" },  // station_01
  { accent: "#B08A4F", soft: "rgba(176, 138, 79, 0.12)", name: "copper" },        // station_02
  { accent: "#A26B54", soft: "rgba(162, 107, 84, 0.12)", name: "clay" },          // station_03
  { accent: "#7D9B76", soft: "rgba(125, 155, 118, 0.12)", name: "sage" },         // station_04
  { accent: "#9C7B9F", soft: "rgba(156, 123, 159, 0.12)", name: "heather" },      // station_05
] as const

export function stationColor(stations: Station[], stationId: string) {
  const idx = stations.findIndex((s) => s.station_id === stationId)
  return STATION_PALETTE[(idx === -1 ? 0 : idx) % STATION_PALETTE.length]
}

export type RiskLevel = "low" | "medium" | "high"

export interface RiskTone {
  /** Background fill (semi-transparent earth) */
  surface: string
  /** Solid edge / accent line */
  accent: string
  /** Foreground text on dark surface */
  ink: string
  /** Glow / shadow color */
  glow: string
  /** Display label */
  label: string
  /** Field-station status code */
  code: string
  /** One-line interpretation */
  caption: string
}

export const RISK_TONES: Record<RiskLevel, RiskTone> = {
  low: {
    surface: "rgba(125, 155, 118, 0.08)",
    accent:  "var(--sage)",
    ink:     "var(--sage-soft)",
    glow:    "var(--sage-glow)",
    label:   "Stable",
    code:    "STA-01 / GREEN",
    caption: "All readings within nominal envelope.",
  },
  medium: {
    surface: "rgba(217, 164, 65, 0.08)",
    accent:  "var(--amber)",
    ink:     "var(--amber-soft)",
    glow:    "var(--amber-glow)",
    label:   "Elevated",
    code:    "STA-02 / AMBER",
    caption: "Saturation rising. Continue close observation.",
  },
  high: {
    surface: "rgba(196, 99, 58, 0.10)",
    accent:  "var(--terracotta)",
    ink:     "var(--terracotta-soft)",
    glow:    "var(--terracotta-glow)",
    label:   "Critical",
    code:    "STA-03 / RED",
    caption: "Slope failure conditions met. Issue advisory.",
  },
}
