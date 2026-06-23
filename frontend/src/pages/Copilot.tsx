import { useEffect, useRef, useState } from 'react'
import { useCopilot } from '../hooks/useCopilot'
import ContextPanel from '../components/copilot/ContextPanel'
import SuggestedPrompts from '../components/copilot/SuggestedPrompts'
import MessageBlocks, { TypingDots } from '../components/copilot/MessageBlocks'

/**
 * AI Operations Copilot — 3-pane dark console (suggested prompts · chat · live
 * context). Works in both the real admin app (mode="real", backend-grounded,
 * LLM-pluggable) and demo mode (mode="demo", offline mock data). Additive: it
 * only reads existing data and never mutates app state.
 */
export default function Copilot({ demo = false }: { demo?: boolean }) {
  const mode = demo ? 'demo' : 'real'
  const { context, messages, busy, error, ask } = useCopilot(mode)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const submit = (q: string) => { if (q.trim() && !busy) { ask(q); setInput('') } }

  return (
    <div className="flex h-full flex-col bg-obsidian text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">AI Copilot</span>
          <span className="rounded-pill bg-ember/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ember">
            {demo ? 'Demo' : 'Operations'}
          </span>
        </div>
        <span className="text-xs text-ash">ChatGPT for operating distributed systems</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_300px]">
        {/* Left — suggested prompts */}
        <aside className="hidden overflow-auto border-r border-white/10 p-5 lg:block">
          <SuggestedPrompts onPick={submit} disabled={busy} />
        </aside>

        {/* Center — conversation */}
        <section className="flex min-h-0 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-6">
            {error && (
              <div className="mb-4 rounded-card border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
            )}
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ember/15 text-ember">✦</div>
                <h2 className="mt-4 text-lg font-semibold">Ask the Operations Copilot</h2>
                <p className="mt-1 max-w-md text-sm text-ash">
                  Grounded in your live orders, events, metrics, service health, correlation and saga IDs.
                  Try a suggested question on the left.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-5">
                {messages.map(msg =>
                  msg.role === 'user' ? (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-card rounded-br-sm bg-ember px-4 py-2.5 text-sm text-white">{msg.text}</div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-ember">✦</div>
                      <div className="min-w-0 flex-1 rounded-card rounded-tl-sm border border-white/10 bg-white/[0.03] px-4 py-3">
                        {msg.answer && (msg.answer.blocks.length > 0 || !msg.streaming)
                          ? <MessageBlocks answer={msg.answer} streaming={msg.streaming} />
                          : <TypingDots />}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-white/10 p-4">
            <form
              onSubmit={e => { e.preventDefault(); submit(input) }}
              className="mx-auto flex max-w-2xl items-center gap-2 rounded-pill border border-white/15 bg-white/[0.04] px-2 py-1.5 focus-within:border-ember/50"
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about an order, incident, or service…"
                className="flex-1 bg-transparent px-3 text-sm text-white placeholder:text-ash focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-pill bg-ember px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ember-hot disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? '…' : 'Ask'}
              </button>
            </form>
            <p className="mt-2 text-center text-[11px] text-ash">
              {demo ? 'Demo mode — answers use simulated data.' : 'Answers are grounded in live system data.'}
            </p>
          </div>
        </section>

        {/* Right — live context */}
        <aside className="hidden overflow-auto border-l border-white/10 p-5 lg:block">
          <ContextPanel context={context} />
        </aside>
      </div>
    </div>
  )
}
