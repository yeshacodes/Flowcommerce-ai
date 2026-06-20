import { apiFetch, SERVICES } from './client'

export interface Product {
  sku: string
  name: string
  description: string
  price_cents: number
  stock_available: number
}

export const catalogApi = {
  listProducts: () =>
    apiFetch<Product[]>(SERVICES.catalog, '/products', {}, false),
}
