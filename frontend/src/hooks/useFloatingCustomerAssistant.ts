/**
 * Drives the global floating customer assistant. It resolves the "active order"
 * from the current route and the available orders, then runs the floating
 * engine. Works in two modes:
 *   - real (demo=false): uses ordersApi (the existing order context endpoint)
 *   - demo (demo=true):  uses static demo orders/events, no backend calls
 *
 * Active-order rules (per spec):
 *   - on an order detail page  -> that order is the context
 *   - otherwise                -> the most recent order ("I'm using your latest order")
 *   - no orders                -> general checkout guidance only
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ordersApi } from '../api/orders'
import { demoEvents, demoOrders } from '../data/demoData'
import { runFloatingAssistant } from '../lib/customer-copilot/floating'
import type {
  CustomerAssistantAnswer,
  CustomerAssistantMessage,
  CustomerOrderContext,
} from '../types/customerCopilot'

// 500–800ms "thinking" pause so the rotating loading message is visible.
const thinkingDelay = () => 500 + Math.floor(Math.random() * 300)
const BLOCK_REVEAL_MS = 110

let idSeq = 0
const nextId = () => `float-${++idSeq}-${Date.now()}`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Matches /orders/:id and /demo/orders/:id (but not /orders).
const detailMatch = (path: string) => path.match(/^\/(?:demo\/)?orders\/([^/]+)$/)

const byTime = (a: { occurred_at?: string | null; created_at: string }, b: { occurred_at?: string | null; created_at: string }) =>
  new Date(a.occurred_at ?? a.created_at).getTime() - new Date(b.occurred_at ?? b.created_at).getTime()

export function useFloatingCustomerAssistant({ demo = false }: { demo?: boolean } = {}) {
  const location = useLocation()
  const [context, setContext] = useState<CustomerOrderContext | null>(null)
  const [usedLatest, setUsedLatest] = useState(false)
  const [hasAnyOrder, setHasAnyOrder] = useState(false)
  const [messages, setMessages] = useState<CustomerAssistantMessage[]>([])
  const [busy, setBusy] = useState(false)

  const ctxRef = useRef<CustomerOrderContext | null>(null)
  const usedLatestRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const apply = (ctx: CustomerOrderContext | null, latest: boolean, anyOrder: boolean) => {
      if (cancelled) return
      ctxRef.current = ctx
      usedLatestRef.current = latest
      setContext(ctx)
      setUsedLatest(latest)
      setHasAnyOrder(anyOrder)
    }

    const resolve = async () => {
      const match = detailMatch(location.pathname)
      try {
        if (demo) {
          if (match) {
            const order = demoOrders.find(o => o.order_id === match[1])
            if (order) {
              const events = demoEvents.filter(e => e.order_id === order.order_id).sort(byTime)
              return apply({ order, events, generated_at: new Date().toISOString() }, false, true)
            }
          }
          const latest = [...demoOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          if (latest) {
            const events = demoEvents.filter(e => e.order_id === latest.order_id).sort(byTime)
            return apply({ order: latest, events, generated_at: new Date().toISOString() }, true, true)
          }
          return apply(null, false, false)
        }

        // Real mode — reuse the existing order context endpoint.
        if (match) {
          const ctx = await ordersApi.context(match[1])
          return apply(ctx, false, true)
        }
        const list = await ordersApi.list(1, 0)
        if (list.orders.length > 0) {
          const ctx = await ordersApi.context(list.orders[0].order_id)
          return apply(ctx, true, true)
        }
        return apply(null, false, false)
      } catch {
        // Missing/inaccessible data → general (no-order) mode, never invent data.
        apply(null, false, false)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [location.pathname, demo])

  const revealAnswer = useCallback(async (assistantId: string, full: CustomerAssistantAnswer) => {
    await sleep(thinkingDelay())
    for (let i = 1; i <= full.blocks.length; i++) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, answer: { ...full, blocks: full.blocks.slice(0, i), citations: [] }, streaming: true }
            : m,
        ),
      )
      await sleep(BLOCK_REVEAL_MS)
    }
    setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, answer: full, streaming: false } : m)))
  }, [])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || busy) return
      const assistantId = nextId()
      setMessages(prev => [
        ...prev,
        { id: nextId(), role: 'user', text: q },
        { id: assistantId, role: 'assistant', answer: { intent: '', blocks: [], citations: [] }, streaming: true },
      ])
      setBusy(true)
      try {
        const answer = runFloatingAssistant(q, ctxRef.current, { usedLatest: usedLatestRef.current })
        await revealAnswer(assistantId, answer)
      } finally {
        setBusy(false)
      }
    },
    [busy, revealAnswer],
  )

  const reset = useCallback(() => setMessages([]), [])

  return { context, usedLatest, hasAnyOrder, messages, busy, ask, reset }
}
