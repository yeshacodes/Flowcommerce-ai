/**
 * Floating customer assistant logic — a thin layer over the existing order-scoped
 * engine (runCustomerAssistant). It adds the cases the per-order assistant never
 * needed: answering general checkout questions when no order exists, and noting
 * when it falls back to the customer's latest order.
 *
 * It does NOT modify the existing engine; order-grounded questions are delegated
 * to runCustomerAssistant so answers stay identical to the Order Detail assistant.
 */
import { runCustomerAssistant } from './engine'
import type { CustomerAssistantAnswer, CustomerOrderContext } from '../../types/customerCopilot'

// Suggested prompts shown in the floating panel (per product spec).
export const FLOATING_PROMPTS = [
  'What can you help me with?',
  'Where is my latest order?',
  'What happens after checkout?',
  'Why did my payment fail?',
  'Explain my order timeline.',
  'Did I get charged?',
]

const cite = (extra: string[] = []) => Array.from(new Set(['Order Service', ...extra]))

export function runFloatingAssistant(
  question: string,
  ctx: CustomerOrderContext | null,
  opts: { usedLatest?: boolean } = {},
): CustomerAssistantAnswer {
  const q = question.toLowerCase().trim()
  if (!q) return capabilities(!!ctx)

  // ── Always answerable, with or without an order ──────────────────────────
  if (/what can you help|help me with|what (do|can) you do/.test(q)) return capabilities(!!ctx)
  if (/after checkout|happens.*checkout|how.*checkout.*work|after.*plac\w*.*order|what happens when i order/.test(q)) {
    return checkoutEducation()
  }

  // ── No order on file: explain generally, never invent order data ─────────
  if (!ctx) {
    if (/where|status|track|latest order|my order/.test(q)) return noOrderYet()
    if (/timeline|explain.*order|what happened/.test(q)) return noOrderYet()
    if (/payment.*fail|why.*fail|declin/.test(q)) return generalPaymentFailure()
    if (/charged|charge|paid/.test(q)) return generalCharge()
    return capabilities(false)
  }

  // ── Order grounded: delegate to the existing engine ──────────────────────
  const base = runCustomerAssistant(question, ctx)
  return opts.usedLatest ? withLatestNote(base, ctx) : base
}

function withLatestNote(answer: CustomerAssistantAnswer, ctx: CustomerOrderContext): CustomerAssistantAnswer {
  return {
    ...answer,
    blocks: [
      { kind: 'paragraph', text: `I found your most recent order (${ctx.order.order_id.slice(0, 8)}…) and analyzed its activity.` },
      ...answer.blocks,
    ],
  }
}

function capabilities(hasOrder: boolean): CustomerAssistantAnswer {
  return {
    intent: 'capabilities',
    blocks: [
      { kind: 'paragraph', text: 'I can answer questions about your orders, checkout, and payments — grounded in your real order events.' },
      { kind: 'heading', text: 'Try asking' },
      { kind: 'bullets', items: [
        { text: 'Where your latest order is' },
        { text: 'What happens after checkout' },
        { text: 'Why a payment failed' },
        { text: 'Whether you were charged' },
        { text: 'To explain your order timeline' },
      ] },
      { kind: 'paragraph', text: hasOrder
        ? 'I can already see one of your orders, so go ahead and ask anything specific.'
        : 'Once you place an order, I can answer order-specific questions about its journey.' },
    ],
    citations: cite(),
  }
}

function checkoutEducation(): CustomerAssistantAnswer {
  return {
    intent: 'checkout_education',
    blocks: [
      { kind: 'heading', text: 'How checkout works' },
      { kind: 'bullets', items: [
        { tone: 'ok', text: 'You place the order — an OrderCreated event starts the workflow.' },
        { tone: 'ok', text: 'Inventory is reserved for your items.' },
        { tone: 'ok', text: 'Payment is processed through Stripe.' },
        { tone: 'ok', text: 'On success the order is confirmed and a confirmation email is sent.' },
        { tone: 'warn', text: 'If payment fails, the reserved inventory is released automatically and you are not charged.' },
      ] },
      { kind: 'paragraph', text: 'After checkout you can open the order to track each of these steps in real time, and I can explain any of them.' },
    ],
    citations: cite(['Event Timeline']),
  }
}

function noOrderYet(): CustomerAssistantAnswer {
  return {
    intent: 'no_order',
    blocks: [
      { kind: 'paragraph', text: "I don't see an order yet. Add an item to your cart and checkout, then I can explain the order journey." },
    ],
    citations: cite(),
  }
}

function generalPaymentFailure(): CustomerAssistantAnswer {
  return {
    intent: 'general_payment_failure',
    blocks: [
      { kind: 'paragraph', text: 'If a payment fails — for example a card decline — the saga automatically releases the reserved inventory and no charge is made.' },
      { kind: 'paragraph', text: 'Once you have an order, I can explain the exact reason from its payment events.' },
    ],
    citations: cite(['Payment Service']),
  }
}

function generalCharge(): CustomerAssistantAnswer {
  return {
    intent: 'general_charge',
    blocks: [
      { kind: 'paragraph', text: 'Your card is only charged after inventory is reserved and the payment step succeeds. If anything fails first, no charge is made.' },
      { kind: 'paragraph', text: 'Place an order and I can confirm the exact payment status for it.' },
    ],
    citations: cite(['Payment Service']),
  }
}
