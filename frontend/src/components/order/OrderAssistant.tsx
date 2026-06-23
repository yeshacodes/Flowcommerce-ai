import { useEffect, useRef, useState } from 'react'
import { useCustomerCopilot } from '../../hooks/useCustomerCopilot'
import { CUSTOMER_ASSISTANT_PROMPTS, type CustomerOrderContext } from '../../types/customerCopilot'
import CustomerMessageBlocks, { CustomerTypingDots } from '../customer-copilot/CustomerMessageBlocks'

export default function OrderAssistant({
  orderId,
  initialContext,
}: {
  orderId?: string
  initialContext?: CustomerOrderContext
}) {
  const { context, messages, busy, error, ask } = useCustomerCopilot(orderId, initialContext)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const submit = (question: string) => {
    if (!question.trim() || busy) return
    ask(question)
    setInput('')
  }

  return (
    <section className="mt-5 overflow-hidden rounded-card border border-white/10 bg-obsidian text-white shadow-soft">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-ember">Ask AI About Your Order</p>
            <h2 className="mt-1 text-base font-semibold">Customer AI Order Assistant</h2>
          </div>
          <span className="rounded-pill bg-ember/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ember">
            Grounded in order data
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ash">Suggested questions</h3>
          <div className="space-y-1.5">
            {CUSTOMER_ASSISTANT_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => submit(prompt)}
                disabled={busy || !context}
                className="block w-full rounded-input border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[13px] text-white/75 transition-colors hover:border-ember/40 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
          {context && (
            <div className="mt-5 rounded-input border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] uppercase tracking-wide text-ash">Order context</p>
              <p className="mt-1 font-mono text-xs text-white">{context.order.order_id.slice(0, 8)}...</p>
              <p className="mt-1 text-xs text-pewter">{context.events.length} event records available</p>
            </div>
          )}
        </aside>

        <div className="flex min-h-[420px] flex-col">
          <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-5">
            {error && (
              <div className="mb-4 rounded-input border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ember/15 text-sm font-bold text-ember">AI</div>
                <h3 className="mt-4 text-base font-semibold">Ask what happened to this order</h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ash">
                  Answers use this order's status, timestamps, payment state, inventory events, notification events, correlation ID, and saga ID.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-5">
                {messages.map(message =>
                  message.role === 'user' ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-card rounded-br-sm bg-ember px-4 py-2.5 text-sm font-medium text-white">
                        {message.text}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-ember">AI</div>
                      <div className="min-w-0 flex-1 rounded-card rounded-tl-sm border border-white/10 bg-white/[0.03] px-4 py-3">
                        {message.answer && (message.answer.blocks.length > 0 || !message.streaming)
                          ? <CustomerMessageBlocks answer={message.answer} streaming={message.streaming} />
                          : <CustomerTypingDots />}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={event => {
              event.preventDefault()
              submit(input)
            }}
            className="border-t border-white/10 p-4"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-pill border border-white/15 bg-white/[0.04] px-2 py-1.5 focus-within:border-ember/50">
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ask about your order..."
                className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white placeholder:text-ash focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim() || !context}
                className="rounded-pill bg-ember px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ember-hot disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? '...' : 'Ask'}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-ash">
              This assistant only answers questions about this order and its event journey.
            </p>
          </form>
        </div>
      </div>
    </section>
  )
}
