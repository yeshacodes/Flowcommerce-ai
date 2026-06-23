import type { OpsEvent, Order } from '../api/orders'
import type { CopilotAnswer, CopilotBlock, Tone } from './copilot'

export type CustomerAssistantBlock = CopilotBlock
export type CustomerAssistantTone = Tone
export type CustomerAssistantAnswer = CopilotAnswer

export interface CustomerOrderEvent extends OpsEvent {}

export interface CustomerOrderContext {
  order: Order
  events: CustomerOrderEvent[]
  generated_at: string
}

export interface CustomerAssistantMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  answer?: CustomerAssistantAnswer
  streaming?: boolean
}

export interface JourneyStep {
  key: string
  label: string
  description: string
  time?: string
  status: 'done' | 'active' | 'pending' | 'failed' | 'warning'
  source?: CustomerOrderEvent
}

export const CUSTOMER_ASSISTANT_PROMPTS = [
  'Where is my order?',
  'What happened after checkout?',
  'Why did my payment fail?',
  'When will my order arrive?',
  'Explain my order timeline.',
]
