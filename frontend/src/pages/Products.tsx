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
    <div className="mx-auto max-w-page px-8 py-10">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Catalog</span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-obsidian">Products</h1>
          <p className="mt-1 text-sm text-ash">Add items to your cart and place an order.</p>
        </div>

        {!loading && (
          <div className="flex items-center gap-4 rounded-pill border border-mist bg-white px-3 py-2 pl-5 shadow-soft">
            {cartEmpty ? (
              <span className="text-sm text-ash">Add at least one item to checkout</span>
            ) : (
              <span className="text-sm text-slate2">
                {cartCount} item{cartCount !== 1 ? 's' : ''} ·{' '}
                <strong className="text-obsidian">{fmt(cartTotal)}</strong>
              </span>
            )}
            <button onClick={goToCheckout} disabled={cartEmpty} className="btn-primary btn-md">
              Checkout
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 rounded-input border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-hot">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse p-7">
              <div className="mb-3 h-4 w-3/4 rounded bg-mist" />
              <div className="mb-2 h-3 w-full rounded bg-snow" />
              <div className="h-3 w-2/3 rounded bg-snow" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(product => {
            const qty = cart[product.sku] ?? 0
            const outOfStock = product.stock_available === 0
            return (
              <div
                key={product.sku}
                className="card flex flex-col gap-5 p-7 transition-shadow hover:shadow-soft"
              >
                <div className="flex-1">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="text-[17px] font-semibold text-obsidian">{product.name}</h2>
                    <span className="whitespace-nowrap text-[15px] font-bold text-obsidian">
                      {fmt(product.price_cents)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ash">{product.description}</p>
                  <div className="mt-3 inline-flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        outOfStock ? 'bg-ember' : product.stock_available < 20 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    />
                    <span className="text-xs font-medium text-ash">
                      {outOfStock ? 'Out of stock' : `${product.stock_available} in stock`}
                    </span>
                  </div>
                </div>

                {!outOfStock && (
                  qty === 0 ? (
                    <button
                      onClick={() => setQty(product.sku, 1)}
                      className="btn-ghost btn-md w-full"
                    >
                      Add to cart
                    </button>
                  ) : (
                    <div className="flex items-center justify-between rounded-pill border border-mist bg-snow px-2 py-1.5">
                      <button
                        onClick={() => setQty(product.sku, qty - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-slate2 transition-colors hover:bg-white hover:text-obsidian"
                      >−</button>
                      <span className="text-sm font-semibold text-obsidian">{qty} in cart</span>
                      <button
                        onClick={() => setQty(product.sku, Math.min(qty + 1, product.stock_available))}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-slate2 transition-colors hover:bg-white hover:text-obsidian"
                      >+</button>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
