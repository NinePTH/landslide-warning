import { PredictResponse, SensorReading, Station } from "@/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function fetchStations(): Promise<Station[]> {
  return apiFetch("/stations")
}

export async function fetchReadings(stationId?: string, limit = 50): Promise<SensorReading[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (stationId) params.set("station_id", stationId)
  return apiFetch(`/readings?${params}`)
}

export async function fetchPredict(stationId?: string): Promise<PredictResponse> {
  const params = new URLSearchParams()
  if (stationId) params.set("station_id", stationId)
  const qs = params.toString()
  return apiFetch(`/predict${qs ? `?${qs}` : ""}`)
}

export async function fetchHistory(
  from: string,
  to: string,
  stationId?: string
): Promise<SensorReading[]> {
  const params = new URLSearchParams({ from, to })
  if (stationId) params.set("station_id", stationId)
  return apiFetch(`/history?${params}`)
}

export async function sendAlert(message?: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(`${API_URL}/alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message ? { message } : {}),
  })
  if (!res.ok) throw new Error(`Alert failed ${res.status}: ${await res.text()}`)
  return res.json()
}
