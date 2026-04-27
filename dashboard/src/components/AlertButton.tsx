"use client"

import { sendAlert } from "@/lib/api"
import { useState } from "react"

type Status = "idle" | "loading" | "success" | "error"

export default function AlertButton() {
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")

  const handleSend = async () => {
    setStatus("loading")
    setMessage("")
    try {
      await sendAlert()
      setStatus("success")
      setMessage("Broadcast dispatched.")
    } catch (err: unknown) {
      setStatus("error")
      setMessage(err instanceof Error ? err.message : "Broadcast failed.")
    } finally {
      setTimeout(() => setStatus("idle"), 4500)
    }
  }

  const tint =
    status === "success"
      ? "var(--sage-soft)"
      : status === "error"
      ? "var(--terracotta)"
      : "var(--terracotta-soft)"

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span
          aria-live="polite"
          className="font-mono text-[10px] tracking-[0.2em] uppercase"
          style={{ color: tint }}
        >
          {message}
        </span>
      )}
      <button
        onClick={handleSend}
        disabled={status === "loading"}
        aria-label="Broadcast Discord alert"
        className="group relative inline-flex items-center gap-3 px-4 py-2.5 border
          font-mono text-[11px] tracking-[0.2em] uppercase transition-all
          disabled:cursor-not-allowed
          hover:bg-[rgba(196,99,58,0.08)]"
        style={{
          borderColor: "var(--terracotta)",
          color: "var(--terracotta-soft)",
        }}
      >
        <span
          className="block w-1.5 h-1.5"
          style={{
            background: "var(--terracotta)",
            boxShadow:
              status === "loading"
                ? "0 0 0 0 var(--terracotta-glow)"
                : "0 0 8px var(--terracotta)",
            animation: status === "loading" ? "live-pulse 1.2s ease-in-out infinite" : undefined,
          }}
        />
        {status === "loading" ? "Dispatching" : "Broadcast Alert"}
        <span aria-hidden className="text-[var(--terracotta)] opacity-60 group-hover:opacity-100 transition-opacity">
          →
        </span>
      </button>
    </div>
  )
}
