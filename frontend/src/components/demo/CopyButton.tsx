import { useState } from 'react'

/**
 * Small inline "copy to clipboard" control used in the demo Event Explorer for
 * correlation_id / saga_id / event_id. Purely client-side; no backend.
 */
export default function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <button
      onClick={copy}
      title={`Copy ${label ?? 'value'}`}
      className="inline-flex items-center gap-1 rounded-pill border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-pewter transition-colors hover:bg-white/10 hover:text-white"
    >
      {copied ? (
        <>
          <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}
