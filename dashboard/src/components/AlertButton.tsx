"use client"

import { sendAlert } from "@/lib/api"
import { useState } from "react"

export default function AlertButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const handleSend = async () => {
    setStatus("loading")
    setMessage("")
    try {
      await sendAlert()
      setStatus("success")
      setMessage("Alert sent via Telegram.")
    } catch (err: any) {
      setStatus("error")
      setMessage(err.message ?? "Failed to send alert.")
    } finally {
      setTimeout(() => setStatus("idle"), 4000)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSend}
        disabled={status === "loading"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium
          hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {status === "loading" ? (
          <>
            <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <span>⚠</span> Send Alert
          </>
        )}
      </button>
      {message && (
        <span
          className={`text-sm ${status === "success" ? "text-green-600" : "text-red-500"}`}
        >
          {message}
        </span>
      )}
    </div>
  )
}
