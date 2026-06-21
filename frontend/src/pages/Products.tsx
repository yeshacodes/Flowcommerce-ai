import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { catalogApi, Product } from '../api/catalog'

type Cart = Record<string, number>

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default function Products() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Cart>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    catalogApi.listProducts()
      .then(setProducts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const setQty = (sku: string, qty: number) => {
    setCart(prev => {
      if (qty <= 0) { const next = { ...prev }; delete next[sku]; return next }
      return { ...prev, [sku]: qty }
    })
  }

  const cartTotal = Object.entries(cart).reduce((sum, [sku, qty]) => {
    const p = products.find(p => p.sku === sku)
    return sum + (p ? p.price_cents * qty : 0)
  }, 0)

  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0)

  const cartEmpty = cartCount === 0

  const goToCheckout = () => {
    navigate('/checkout', { state: { cart, products } })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500 mt-0.5">Add items to your cart and place an order</p>
        </div>
        {!loading && (
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
            {cartEmpty ? (
              <span className="text-sm text-slate-400">Add at least one item to checkout</span>
            ) : (
              <span className="text-sm text-slate-600">
                {cartCount} item{cartCount !== 1 ? 's' : ''} · <strong>{fmt(cartTotal)}</strong>
              </span>
            )}
            <button
              onClick={goToCheckout}
              disabled={cartEmpty}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              Checkout →
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-full mb-2" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(product => {
            const qty = cart[product.sku] ?? 0
            const outOfStock = product.stock_available === 0
            return (
              <div key={product.sku} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h2 className="font-semibold text-slate-900">{product.name}</h2>
                    <span className="text-blue-600 font-bold text-sm whitespace-nowrap">{fmt(product.price_cents)}</span>
                  </div>
                  <p className="text-sm text-slate-500">{product.description}</p>
                  <p className={`text-xs mt-2 font-medium ${outOfStock ? 'text-red-500' : 'text-emerald-600'}`}>
                    {outOfStock ? 'Out of stock' : `${product.stock_available} in stock`}
                  </p>
                </div>

                {!outOfStock && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty(product.sku, qty - 1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-30 text-lg leading-none"
                    >−</button>
                    <span className="w-8 text-center text-sm font-medium text-slate-900">{qty}</span>
                    <button
                      onClick={() => setQty(product.sku, Math.min(qty + 1, product.stock_available))}
                      className="w-8 h-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-lg leading-none"
                    >+</button>
                    {qty === 0 && (
                      <button
                        onClick={() => setQty(product.sku, 1)}
                        className="ml-auto text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Add to cart
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
