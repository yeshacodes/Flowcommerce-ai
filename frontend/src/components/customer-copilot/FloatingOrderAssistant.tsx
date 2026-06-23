import { useEffect, useRef, useState } from 'react'
import { useFloatingCustomerAssistant } from '../../hooks/useFloatingCustomerAssistant'
import CustomerMessageBlocks from './CustomerMessageBlocks'

/**
 * Global customer-facing floating AI assistant (presentation layer only).
 * Reuses the existing customer copilot engine/context via
 * useFloatingCustomerAssistant — no backend/API/auth/saga changes.
 *
 * Pass `demo` to source context from static demo data (no backend/login).
 */

const QUICK_ACTIONS = [
  'Where is my latest order?',
  'Explain my order timeline',
  'What happens after checkout?',
  'Why did my payment fail?',
  'Did I get charged?',
]

const THINKING_PHRASES = [
  'Thinking',
  'Analyzing order events',
  'Checking payment records',
  'Reviewing order timeline',
  'Looking at saga events',
  'Inspecting system activity',
]

export default function FloatingOrderAssistant({ demo = false }: { demo?: boolean }) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [input, setInput] = useState('')
  const { context, hasAnyOrder, messages, busy, ask } = useFloatingCustomerAssistant({ demo })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  const submit = (q: string) => {
    if (!q.trim() || busy) return
    ask(q)
    setInput('')
  }

  const close = () => {
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 160)
  }

  const greeting = hasAnyOrder
    ? '👋 I found your most recent order and can explain its status, timeline, payment information, and any issues that occurred.'
    : '👋 You don\'t have any orders yet. I can still explain how checkout works and what happens after an order is placed.'

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Launcher pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask FlowCommerce AI"
          className="fca-pulse fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-pill bg-gradient-to-r from-ember to-ember-hot px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:scale-105 hover:shadow-[0_0_36px_rgba(255,95,52,0.65)]"
        >
          <SparkleIcon />
          <span className="hidden sm:inline">Ask FlowCommerce AI</span>
          <span className="sm:hidden">Ask AI</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex max-h-[600px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card border border-white/10 bg-obsidian text-white shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          style={{ animation: `${closing ? 'fcaOut 160ms ease-in forwards' : 'fcaIn 200ms cubic-bezier(0.16,1,0.3,1)'}` }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-ember/15 to-transparent px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-ember to-ember-hot text-white"><SparkleIcon /></span>
              <div>
                <p className="text-sm font-semibold leading-tight">FlowCommerce AI</p>
                <p className="text-[11px] text-ash">Ask about orders, checkout, payments, or delivery updates.</p>
              </div>
            </div>
            <button onClick={close} aria-label="Close assistant" className="rounded-tile p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          {demo && (
            <div className="flex items-center gap-1.5 border-b border-white/10 bg-ember/10 px-4 py-1.5 text-[11px] text-ember">
              <span className="h-1.5 w-1.5 rounded-full bg-ember" /> Demo Mode — simulated data
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <p className="text-[13px] leading-relaxed text-white/85">{greeting}</p>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ash">Quick actions</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map(q => (
                      <button
                        key={q}
                        onClick={() => submit(q)}
                        disabled={busy}
                        className="rounded-pill border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 transition-colors hover:border-ember/50 hover:bg-ember/15 hover:text-white disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map(m =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-card rounded-br-sm bg-ember px-3 py-2 text-[13px] font-medium text-white">{m.text}</div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-2">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ember to-ember-hot text-[9px] font-bold text-white">AI</div>
                      <div className="min-w-0 flex-1 rounded-card rounded-tl-sm border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px]">
                        {m.answer && m.answer.blocks.length > 0 ? (
                          <CustomerMessageBlocks answer={m.answer} streaming={m.streaming} />
                        ) : (
                          <ThinkingIndicator />
                        )}
                        {!m.streaming && m.answer && m.answer.blocks.length > 0 && (
                          <p className="mt-3 border-t border-white/5 pt-2 text-[10.5px] leading-relaxed text-ash">
                            {context
                              ? `Grounded in order ${context.order.order_id.slice(0, 8)}… • ${context.events.length} events analyzed`
                              : 'Powered by order events, payment records, and saga workflow data.'}
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={e => { e.preventDefault(); submit(input) }} className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2 rounded-pill border border-white/15 bg-white/[0.04] px-2 py-1 focus-within:border-ember/50">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask a question..."
                className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-white placeholder:text-ash focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-pill bg-gradient-to-r from-ember to-ember-hot px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? '…' : 'Ask'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function ThinkingIndicator() {
  const [phrase] = useState(() => THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)])
  return (
    <div className="flex items-center gap-2 py-0.5 text-[12px] text-ash">
      <span className="flex gap-1">
        {[0, 1, 2].map(i => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-ember" style={{ animation: `fcaDot 1s ease-in-out ${i * 0.16}s infinite` }} />
        ))}
      </span>
      <span>{phrase}</span>
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8L19 14Z" />
    </svg>
  )
}

// Self-contained keyframes so no global config/CSS changes are needed.
const KEYFRAMES = `
@keyframes fcaIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes fcaOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(10px) scale(0.98); } }
@keyframes fcaDot { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@keyframes fcaPulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,95,52,0.0), 0 8px 24px -6px rgba(255,95,52,0.45); }
  50% { box-shadow: 0 0 0 8px rgba(255,95,52,0.0), 0 8px 30px -4px rgba(255,95,52,0.75); }
}
.fca-pulse { animation: fcaPulseGlow 3.2s ease-in-out infinite; }
.fca-pulse:hover { animation: none; }
@media (prefers-reduced-motion: reduce) { .fca-pulse { animation: none; } }
`
