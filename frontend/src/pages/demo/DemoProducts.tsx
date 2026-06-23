import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { demoProducts } from '../../data/demoData'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** Demo catalog — mirrors the real Products page visually but uses mock data
 *  and a simulated cart that "checks out" to the demo orders list. */
export default function DemoProducts() {
  const navigate = useNavigate()
  const [cart, setCart] = useState<Record<string, number>>({})

  const setQty = (sku: string, qty: number) =>
    setCart(prev => {
      if (qty <= 0) { const next = { ...prev }; delete next[sku]; return next }
      return { ...prev, [sku]: qty }
    })

  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0)
  const cartTotal = Object.entries(cart).reduce((sum, [sku, qty]) => {
    const p = demoProducts.find(p => p.sku === sku)
    return sum + (p ? p.price_cents * qty : 0)
  }, 0)
  const cartEmpty = cartCount === 0

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ash">Catalog</p>
          <h1 className="text-xl font-semibold text-slate2">Products</h1>
          <p className="mt-0.5 text-sm text-ash">Add items to your cart and place an order.</p>
        </div>
        <div className="flex items-center gap-3 rounded-card border border-mist bg-white px-5 py-3 shadow-soft">
          {cartEmpty ? (
            <span className="text-sm text-ash">Add at least one item to checkout</span>
          ) : (
            <span className="text-sm text-slate2">
              {cartCount} item{cartCount !== 1 ? 's' : ''} · <strong>{fmt(cartTotal)}</strong>
            </span>
          )}
          <button
            onClick={() => navigate('/demo/orders')}
            disabled={cartEmpty}
            className="rounded-pill bg-ember px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ember-hot disabled:cursor-not-allowed disabled:opacity-40"
          >
            Checkout →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demoProducts.map(product => {
          const qty = cart[product.sku] ?? 0
          return (
            <div key={product.sku} className="flex flex-col gap-4 rounded-card border border-mist bg-white p-6">
              <div className="flex-1">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate2">{product.name}</h2>
                  <span className="whitespace-nowrap text-sm font-bold text-ember">{fmt(product.price_cents)}</span>
                </div>
                <p className="text-sm text-ash">{product.description}</p>
                <p className="mt-2 text-xs font-medium text-emerald-600">{product.stock_available} in stock</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(product.sku, qty - 1)} disabled={qty === 0}
                  className="h-8 w-8 rounded-tile border border-pewter text-lg leading-none text-slate2 hover:bg-snow disabled:opacity-30">−</button>
                <span className="w-8 text-center text-sm font-medium text-slate2">{qty}</span>
                <button onClick={() => setQty(product.sku, qty + 1)}
                  className="h-8 w-8 rounded-tile border border-pewter text-lg leading-none text-slate2 hover:bg-snow">+</button>
                {qty === 0 && (
                  <button onClick={() => setQty(product.sku, 1)} className="ml-auto text-sm font-medium text-ember hover:text-ember-hot">
                    Add to cart
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
