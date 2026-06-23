import { apiFetch, SERVICES } from './client'

export interface Product {
  sku: string
  name: string
  description: string
  price_cents: number
  stock_available: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface ProductCreateInput {
  sku: string
  name: string
  description: string
  price_cents: number
  stock_quantity: number
  is_active: boolean
}

export interface ProductUpdateInput {
  name?: string
  description?: string
  price_cents?: number
  stock_quantity?: number
  is_active?: boolean
}

export const catalogApi = {
  // Public — customers see active products only.
  listProducts: () =>
    apiFetch<Product[]>(SERVICES.catalog, '/products', {}, false),

  // Admin — includes inactive products for management.
  listAllProducts: () =>
    apiFetch<Product[]>(SERVICES.catalog, '/products?include_inactive=true'),

  createProduct: (input: ProductCreateInput) =>
    apiFetch<Product>(SERVICES.catalog, '/products', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateProduct: (sku: string, input: ProductUpdateInput) =>
    apiFetch<Product>(SERVICES.catalog, `/products/${sku}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deactivateProduct: (sku: string) =>
    apiFetch<Product>(SERVICES.catalog, `/products/${sku}/deactivate`, {
      method: 'PATCH',
    }),
}
