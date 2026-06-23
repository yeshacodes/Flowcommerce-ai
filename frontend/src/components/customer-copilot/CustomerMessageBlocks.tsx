import { useState } from 'react'
import type { CustomerAssistantAnswer, CustomerAssistantBlock, CustomerAssistantTone } from '../../types/customerCopilot'
import CopyButton from '../demo/CopyButton'

const toneText: Record<CustomerAssistantTone, string> = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
  neutral: 'text-pewter',
}

const toneIcon: Record<CustomerAssistantTone, string> = {
  ok: '✓',
  warn: '!',
  error: '✕',
  neutral: '•',
}

const COPYABLE = /correlation id|saga id|order id|event id|payment intent/i

function Block({ block }: { block: CustomerAssistantBlock }) {
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
              <span className={`mt-0.5 w-5 flex-shrink-0 text-[10px] font-bold ${toneText[it.tone ?? 'neutral']}`}>
                {toneIcon[it.tone ?? 'neutral']}
              </span>
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      )
    case 'keyvalue':
      return (
        <div className="overflow-hidden rounded-input border border-white/10 bg-white/[0.03]">
          {block.pairs.map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 last:border-0">
              <span className="text-[11px] uppercase tracking-wide text-ash">{k}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-xs text-white" title={v}>{v}</span>
                {COPYABLE.test(k) && v && v !== 'unavailable' && <CopyButton value={v} label={k} />}
              </span>
            </div>
          ))}
        </div>
      )
    case 'code':
      return (
        <div className="overflow-hidden rounded-input border border-white/10 bg-void/60">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ash">{block.label ?? block.language ?? 'payload'}</span>
            <CopyButton value={block.code} label="code" />
          </div>
          <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-pewter">{block.code}</pre>
        </div>
      )
    case 'status':
      return (
        <div className={`inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-medium ${toneText[block.tone]}`}>
          <span className="text-[10px] font-bold">{toneIcon[block.tone]}</span> {block.label}
        </div>
      )
  }
}

export default function CustomerMessageBlocks({ answer, streaming }: { answer: CustomerAssistantAnswer; streaming?: boolean }) {
  const [showSources, setShowSources] = useState(false)

  return (
    <div className="space-y-3">
      {answer.blocks.map((block, i) => <Block key={i} block={block} />)}
      {streaming && <CustomerTypingDots />}
      {!streaming && answer.citations.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setShowSources(s => !s)} className="text-[11px] font-medium text-ash hover:text-white">
            {showSources ? 'Hide' : 'Show'} sources ({answer.citations.length})
          </button>
          {showSources && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {answer.citations.map(source => (
                <span key={source} className="rounded-pill border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-pewter">
                  {source}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CustomerTypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ash" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}
