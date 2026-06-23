/**
 * Shared types for the AI Operations Copilot.
 *
 * Answers are represented as a list of structured "blocks" rather than raw
 * markdown so the UI can render rich elements (status lines, key/value tables,
 * syntax-highlighted payloads with copy buttons) and so the same schema can be
 * produced by the client rule engine (demo) and the backend (real / LLM).
 */
import type { Product } from '../api/catalog'
import type { MetricsSummary, OpsEvent, Order, ServiceHealth } from '../api/orders'

export type Tone = 'ok' | 'warn' | 'error' | 'neutral'

export type CopilotBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: { tone?: Tone; text: string }[] }
  | { kind: 'keyvalue'; pairs: [string, string][] }
  | { kind: 'code'; code: string; language?: string; label?: string }
  | { kind: 'status'; label: string; tone: Tone }

export interface CopilotAnswer {
  intent: string
  blocks: CopilotBlock[]
  citations: string[]
}

/** Grounding data the engine reasons over. Built from demo data (demo mode) or
 *  fetched from GET /admin/copilot/context (real mode). */
export interface CopilotContext {
  metrics: MetricsSummary
  services: ServiceHealth[]
  servicesHealthy: number
  servicesTotal: number
  recentEvents: OpsEvent[]
  orders: Order[]
  lowStock: Product[]
  generatedAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  /** For user messages: the raw text. */
  text?: string
  /** For assistant messages: the structured answer. */
  answer?: CopilotAnswer
  /** True while the assistant message is still streaming in. */
  streaming?: boolean
}

export const SUGGESTED_PROMPTS: string[] = [
  'Why did Order #123 fail?',
  'Explain the lifecycle of Order #123.',
  "Summarize today's system activity.",
  'Which service is unhealthy?',
  "Show today's failed payments.",
  'Which products are close to running out of stock?',
  'Explain the payment workflow.',
  'Explain the saga orchestration.',
  'Show orders taking longer than 5 seconds.',
  'Generate an incident report.',
]
