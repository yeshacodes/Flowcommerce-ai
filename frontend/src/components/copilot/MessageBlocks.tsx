import { useState } from 'react'
import type { CopilotAnswer, CopilotBlock, Tone } from '../../types/copilot'
import CopyButton from '../demo/CopyButton'

const toneText: Record<Tone, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  neutral: 'text-pewter',
}
const toneIcon: Record<Tone, string> = { ok: '✓', warn: '!', error: '✕', neutral: '•' }

// ids worth offering a copy button for in key/value tables
const COPYABLE = /correlation id|saga id|order id|event id/i

function Block({ block }: { block: CopilotBlock }) {
  switch (block.kind) {
    case 'heading':
      return <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-ash first:mt-0">{block.text}</p>
    case 'paragraph':
      return <p className="text-sm leading-relaxed text-white/85">{block.text}</p>
    case 'bullets':
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/85">
              <span className={`mt-0.5 ${toneText[it.tone ?? 'neutral']}`}>{toneIcon[it.tone ?? 'neutral']}</span>
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      )
    case 'keyvalue':
      return (
        <div className="overflow-hidden rounded-tile border border-white/10">
          {block.pairs.map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 last:border-0">
              <span className="text-[11px] uppercase tracking-wide text-ash">{k}</span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate font-mono text-xs text-white" title={v}>{v}</span>
                {COPYABLE.test(k) && v && v !== '—' && <CopyButton value={v} label={k} />}
              </span>
            </div>
          ))}
        </div>
      )
    case 'code':
      return (
        <div className="overflow-hidden rounded-tile border border-white/10 bg-void/60">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ash">{block.label ?? block.language ?? 'payload'}</span>
            <CopyButton value={block.code} label="code" />
          </div>
          <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-pewter">{block.code}</pre>
        </div>
      )
    case 'status':
      return (
        <div className={`inline-flex items-center gap-2 rounded-pill border border-white/10 px-3 py-1 text-sm font-medium ${toneText[block.tone]}`}>
          <span>{toneIcon[block.tone]}</span> {block.label}
        </div>
      )
  }
}

export default function MessageBlocks({ answer, streaming }: { answer: CopilotAnswer; streaming?: boolean }) {
  const [showCitations, setShowCitations] = useState(false)
  return (
    <div className="space-y-3">
      {answer.blocks.map((b, i) => <Block key={i} block={b} />)}
      {streaming && <TypingDots />}
      {!streaming && answer.citations.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setShowCitations(s => !s)} className="text-[11px] font-medium text-ash hover:text-white">
            {showCitations ? '▾' : '▸'} Sources ({answer.citations.length})
          </button>
          {showCitations && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {answer.citations.map(c => (
                <span key={c} className="rounded-pill border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-pewter">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ash" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}
