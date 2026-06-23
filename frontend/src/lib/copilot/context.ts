/**
 * Builds the CopilotContext the engine reasons over.
 *  - demo mode: assembled from static demo data (no network).
 *  - real mode: fetched from GET /admin/copilot/context (admin-only).
 */
import { apiFetch, SERVICES } from '../../api/client'
import type { Product } from '../../api/catalog'
import type { MetricsSummary, OpsEvent, Order, ServiceHealth } from '../../api/orders'
import type { CopilotContext } from '../../types/copilot'
import {
  demoEvents,
  demoMetrics,
  demoOrders,
  demoProducts,
  demoSystemHealth,
} from '../../data/demoData'

const LOW_STOCK_THRESHOLD = 80

export function buildDemoContext(): CopilotContext {
  const services = demoSystemHealth.services
  return {
    metrics: demoMetrics,
    services,
    servicesHealthy: services.filter(s => s.status === 'healthy').length,
    servicesTotal: services.length,
    recentEvents: demoEvents,
    orders: demoOrders,
    lowStock: demoProducts.filter(p => p.stock_available < LOW_STOCK_THRESHOLD),
    generatedAt: new Date().toISOString(),
  }
}

interface RawContext {
  metrics: MetricsSummary
  services: ServiceHealth[]
  recent_events: OpsEvent[]
  orders: Order[]
  low_stock: Product[]
  llm_enabled?: boolean
}

export async function fetchRealContext(): Promise<CopilotContext & { llmEnabled: boolean }> {
  const raw = await apiFetch<RawContext>(SERVICES.orders, '/admin/copilot/context')
  const services = raw.services ?? []
  return {
    metrics: raw.metrics,
    services,
    servicesHealthy: services.filter(s => s.status === 'healthy').length,
    servicesTotal: services.length,
    recentEvents: raw.recent_events ?? [],
    orders: raw.orders ?? [],
    lowStock: raw.low_stock ?? [],
    generatedAt: new Date().toISOString(),
    llmEnabled: !!raw.llm_enabled,
  }
}
