import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCustomerOrderContext } from '../lib/customer-copilot/context'
import { runCustomerAssistant } from '../lib/customer-copilot/engine'
import type {
  CustomerAssistantAnswer,
  CustomerAssistantMessage,
  CustomerOrderContext,
} from '../types/customerCopilot'

const TYPING_DELAY_MS = 360
const BLOCK_REVEAL_MS = 120
const REFRESH_MS = 2500

let idSeq = 0
const nextId = () => `customer-${++idSeq}-${Date.now()}`

export function useCustomerCopilot(orderId?: string, initialContext?: CustomerOrderContext) {
  const [context, setContext] = useState<CustomerOrderContext | null>(initialContext ?? null)
  const [messages, setMessages] = useState<CustomerAssistantMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const contextRef = useRef<CustomerOrderContext | null>(initialContext ?? null)

  useEffect(() => {
    if (initialContext) {
      setContext(initialContext)
      contextRef.current = initialContext
    }
  }, [initialContext])

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let timer: number | undefined

    const load = async () => {
      try {
        const next = await fetchCustomerOrderContext(orderId)
        if (cancelled) return
        setContext(next)
        contextRef.current = next
        setError('')
        if (next.order.status === 'PENDING') timer = window.setTimeout(load, REFRESH_MS)
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load order context')
      }
    }

    load()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [orderId])

  const revealAnswer = useCallback(async (assistantId: string, full: CustomerAssistantAnswer) => {
    await sleep(TYPING_DELAY_MS)
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
      const ctx = contextRef.current
      if (!q || busy) return

      const userMsg: CustomerAssistantMessage = { id: nextId(), role: 'user', text: q }
      const assistantId = nextId()
      const assistantMsg: CustomerAssistantMessage = {
        id: assistantId,
        role: 'assistant',
        answer: { intent: '', blocks: [], citations: [] },
        streaming: true,
      }
      setMessages(prev => [...prev, userMsg, assistantMsg])
      setBusy(true)
      try {
        const answer = ctx
          ? runCustomerAssistant(q, ctx)
          : {
              intent: 'not_enough',
              blocks: [{ kind: 'paragraph' as const, text: "I don't have enough information to answer that from the available order data." }],
              citations: ['Order Service'],
            }
        await revealAnswer(assistantId, answer)
      } finally {
        setBusy(false)
      }
    },
    [busy, revealAnswer],
  )

  return { context, messages, busy, error, ask }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
