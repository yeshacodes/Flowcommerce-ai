/**
 * State + behavior for the AI Copilot chat.
 *
 * - Loads grounding context (demo: local; real: GET /admin/copilot/context) and
 *   auto-refreshes it every 5s for the live context panel.
 * - ask() appends the user message and a streaming assistant message, computes a
 *   grounded answer (real + LLM-enabled → backend POST /admin/copilot/query;
 *   otherwise the local rule engine), then reveals the answer block-by-block to
 *   simulate token streaming with a typing indicator.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, SERVICES } from '../api/client'
import { buildDemoContext, fetchRealContext } from '../lib/copilot/context'
import { runCopilot } from '../lib/copilot/engine'
import type { ChatMessage, CopilotAnswer, CopilotContext } from '../types/copilot'

const CONTEXT_REFRESH_MS = 5000
const TYPING_DELAY_MS = 450
const BLOCK_REVEAL_MS = 130

let idSeq = 0
const nextId = () => `m${++idSeq}-${Date.now()}`

export function useCopilot(mode: 'demo' | 'real') {
  const [context, setContext] = useState<CopilotContext | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const llmEnabled = useRef(false)
  const ctxRef = useRef<CopilotContext | null>(null)

  // Load + auto-refresh context.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (mode === 'demo') {
          const c = buildDemoContext()
          if (!cancelled) { setContext(c); ctxRef.current = c }
        } else {
          const c = await fetchRealContext()
          if (!cancelled) {
            llmEnabled.current = c.llmEnabled
            setContext(c); ctxRef.current = c
          }
        }
        if (!cancelled) setError('')
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load context')
      }
    }
    load()
    const t = setInterval(load, CONTEXT_REFRESH_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [mode])

  const revealAnswer = useCallback(async (assistantId: string, full: CopilotAnswer) => {
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
    // Final state: all blocks + citations, streaming done.
    setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, answer: full, streaming: false } : m)))
  }, [])

  const computeAnswer = useCallback(async (question: string): Promise<CopilotAnswer> => {
    const ctx = ctxRef.current
    if (!ctx) {
      return { intent: 'unknown', blocks: [{ kind: 'paragraph', text: "I don't have enough information to determine the root cause." }], citations: [] }
    }
    if (mode === 'real' && llmEnabled.current) {
      try {
        return await apiFetch<CopilotAnswer>(SERVICES.orders, '/admin/copilot/query', {
          method: 'POST',
          body: JSON.stringify({ question }),
        })
      } catch {
        // Fall back to the local engine if the backend/LLM call fails.
        return runCopilot(question, ctx)
      }
    }
    return runCopilot(question, ctx)
  }, [mode])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || busy) return
      const userMsg: ChatMessage = { id: nextId(), role: 'user', text: q }
      const assistantId = nextId()
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', answer: { intent: '', blocks: [], citations: [] }, streaming: true }
      setMessages(prev => [...prev, userMsg, assistantMsg])
      setBusy(true)
      try {
        const answer = await computeAnswer(q)
        await revealAnswer(assistantId, answer)
      } finally {
        setBusy(false)
      }
    },
    [busy, computeAnswer, revealAnswer],
  )

  return { context, messages, busy, error, ask }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
