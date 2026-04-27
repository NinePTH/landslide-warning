/**
 * Fixed-position SVG of stylised topographic contour lines.
 * Sits below all content as ambient atmosphere.
 */
export default function TopographicBackdrop() {
  // Generate contour lines deterministically — wavy bands at varied amplitudes.
  const lines = Array.from({ length: 22 }, (_, i) => {
    const y = 40 + i * 36
    const amp = 14 + (i % 5) * 6
    const wavelength = 220 + (i % 4) * 80
    const phase = (i * 37) % 360
    return { y, amp, wavelength, phase, opacity: 0.04 + (i % 3) * 0.012 }
  })

  return (
    <svg
      aria-hidden
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="topo-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--ink-100)" stopOpacity="0" />
          <stop offset="40%" stopColor="var(--ink-100)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--ink-100)" stopOpacity="0.4" />
        </linearGradient>
        <mask id="topo-mask">
          <rect width="1600" height="1000" fill="url(#topo-fade)" />
        </mask>
      </defs>
      <g mask="url(#topo-mask)">
        {lines.map((l, i) => {
          // Build a wavy path
          const points: string[] = []
          for (let x = -50; x <= 1650; x += 20) {
            const wave =
              Math.sin((x / l.wavelength) * Math.PI * 2 + (l.phase * Math.PI) / 180) *
              l.amp
            const wave2 =
              Math.sin((x / (l.wavelength * 0.4)) * Math.PI * 2 + (l.phase * Math.PI) / 90) *
              (l.amp * 0.3)
            points.push(`${x},${l.y + wave + wave2}`)
          }
          return (
            <polyline
              key={i}
              points={points.join(" ")}
              fill="none"
              stroke="var(--ink-100)"
              strokeOpacity={l.opacity}
              strokeWidth={i % 5 === 0 ? 0.7 : 0.4}
            />
          )
        })}
      </g>

      {/* Compass rose top-right corner */}
      <g
        transform="translate(1500 80)"
        stroke="var(--copper)"
        strokeOpacity="0.35"
        fill="none"
      >
        <circle r="32" strokeWidth="0.5" />
        <circle r="22" strokeWidth="0.5" />
        <line x1="0" y1="-40" x2="0" y2="40" strokeWidth="0.5" />
        <line x1="-40" y1="0" x2="40" y2="0" strokeWidth="0.5" />
        <text
          y="-46"
          textAnchor="middle"
          fontSize="9"
          fill="var(--copper)"
          fillOpacity="0.6"
          fontFamily="var(--font-mono)"
          letterSpacing="0.2em"
        >
          N
        </text>
      </g>

      {/* Coordinate label */}
      <text
        x="40"
        y="970"
        fontFamily="var(--font-mono)"
        fontSize="10"
        fill="var(--ink-400)"
        letterSpacing="0.15em"
      >
        18°47′N · 098°59′E · ELEV 312m
      </text>
    </svg>
  )
}
