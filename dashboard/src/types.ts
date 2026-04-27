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
