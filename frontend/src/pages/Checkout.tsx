import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { Product } from '../api/catalog'
import { ordersApi } from '../api/orders'

// Initialised once at module load; null when public key is not configured.
const STRIPE_PK = (import.meta.env.VITE_STRIPE_PUBLIC_KEY as string) || ''
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null

type Cart = Record<string, number>

interface CheckoutState {
  cart: Cart
  products: Product[]
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

// ── Order summary (left column) ────────────────────────────────────────────

function OrderSummary({
  cart,
  products,
  totalCents,
}: {
  cart: Cart
  products: Product[]
  totalCents: number
}) {
  return (
    <div className="card p-7">
      <span className="eyebrow">Order Summary</span>
      <div className="mb-5 mt-4 space-y-4">
        {Object.entries(cart).map(([sku, qty]) => {
          const product = products.find(p => p.sku === sku)
          if (!product) return null
          return (
            <div key={sku} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-obsidian">{product.name}</p>
                <p className="text-xs text-ash">Qty {qty} × {fmt(product.price_cents)}</p>
              </div>
              <p className="text-sm font-semibold text-obsidian">
                {fmt(product.price_cents * qty)}
              </p>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t border-mist pt-4">
        <span className="text-sm font-medium text-slate2">Total due</span>
        <span className="text-2xl font-bold tracking-tight text-obsidian">{fmt(totalCents)}</span>
      </div>
    </div>
  )
}

// ── Stripe card form (rendered inside <Elements>) ───────────────────────────

const CARD_STYLE = {
  style: {
    base: {
      color: '#0c0c0c',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
      fontSize: '15px',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#7e7e7f' },
    },
    invalid: { color: '#f31010', iconColor: '#f31010' },
  },
  hidePostalCode: true,
}

function StripeCardForm({
  clientSecret,
  totalCents,
  items,
  onSuccess,
}: {
  clientSecret: string
  totalCents: number
  items: Array<{ sku: string; quantity: number }>
  onSuccess: (orderId: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    setError('')

    const card = elements.getElement(CardElement)
    if (!card) { setPaying(false); return }

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: { card } },
    )

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed — please try again.')
      setPaying(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        const order = await ordersApi.create(items, paymentIntent.id)
        onSuccess(order.order_id)
      } catch (err: any) {
        setError(err.message ?? 'Order creation failed after payment.')
        setPaying(false)
      }
    } else {
      setError('Payment was not completed. Please try again.')
      setPaying(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card p-7">
        {/* Header */}
        <div className="mb-6 flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="eyebrow">Secure Payment</span>
        </div>

        {/* Card input */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-medium text-obsidian">Card details</label>
          <div className="rounded-input border border-pewter/70 px-4 py-3.5 transition-all focus-within:border-ember focus-within:ring-2 focus-within:ring-ember/20">
            <CardElement options={CARD_STYLE} />
          </div>
        </div>

        {/* Test card hint */}
        <div className="mb-5 rounded-input border border-mist bg-snow px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ash">Test card</p>
          <p className="font-mono text-[13px] text-obsidian">4242 4242 4242 4242</p>
          <p className="mt-0.5 text-xs text-ash">Any future expiry · Any 3-digit CVC · Any ZIP</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-input border border-ember/30 bg-ember/5 px-3 py-2.5 text-xs text-ember-hot">
            {error}
          </div>
        )}

        {/* Pay button */}
        <button type="submit" disabled={!stripe || paying} className="btn-primary btn-lg w-full">
          {paying ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Processing…
            </span>
          ) : (
            `Pay ${fmt(totalCents)}`
          )}
        </button>

        {/* Powered by Stripe */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          <svg className="h-4" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.87zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.84zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.5 0 3 .07 4.46.48V9.1c-1.36-.4-2.96-.84-4.46-.84-.86 0-1.44.23-1.44.85 0 1.85 6.29.97 6.29 5.69z" fill="#6772E5"/>
          </svg>
          <span className="text-xs text-ash">Powered by Stripe</span>
        </div>
      </div>
    </form>
  )
}

// ── Fallback form when Stripe is not configured ─────────────────────────────

function FallbackPaymentForm({
  totalCents,
  items,
  onSuccess,
}: {
  totalCents: number
  items: Array<{ sku: string; quantity: number }>
  onSuccess: (orderId: string) => void
}) {
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  const handlePlace = async () => {
    setPlacing(true)
    setError('')
    try {
      const order = await ordersApi.create(items)
      onSuccess(order.order_id)
    } catch (err: any) {
      setError(err.message)
      setPlacing(false)
    }
  }

  return (
    <div className="card p-7">
      <div className="mb-6 flex items-center gap-2">
        <svg className="h-4 w-4 flex-shrink-0 text-ash" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <span className="eyebrow">Payment</span>
      </div>

      <div className="mb-5 rounded-input border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Stripe not configured
        </p>
        <p className="text-xs text-amber-700/80">
          Add <code className="rounded bg-amber-100 px-1 font-mono">VITE_STRIPE_PUBLIC_KEY</code> to
          your frontend <code className="rounded bg-amber-100 px-1 font-mono">.env</code> to enable
          real card payments. Using simulated payment for now.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-input border border-ember/30 bg-ember/5 px-3 py-2.5 text-xs text-ember-hot">
          {error}
        </div>
      )}

      <button onClick={handlePlace} disabled={placing} className="btn-dark btn-lg w-full">
        {placing ? 'Placing…' : `Place Order (simulated) — ${fmt(totalCents)}`}
      </button>
    </div>
  )
}

// ── Main Checkout page ──────────────────────────────────────────────────────

export default function Checkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as CheckoutState | null

  const hasCart = !!(state?.cart && Object.keys(state.cart).length > 0)
  const items = hasCart
    ? Object.entries(state!.cart).map(([sku, quantity]) => ({ sku, quantity }))
    : []

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [totalCents, setTotalCents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!hasCart) return
    ordersApi
      .createPaymentIntent(items)
      .then(r => {
        setClientSecret(r.client_secret)
        setTotalCents(r.total_cents)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [hasCart]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasCart) return <Navigate to="/products" replace />

  const handleSuccess = (orderId: string) => navigate(`/orders/${orderId}`)

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-ash">
        <button onClick={() => navigate('/products')} className="transition-colors hover:text-obsidian">
          Products
        </button>
        <span>›</span>
        <span className="font-medium text-slate2">Checkout</span>
      </div>

      <h1 className="mb-7 text-2xl font-bold tracking-tight text-obsidian">Checkout</h1>

      {error && (
        <div className="mb-5 rounded-input border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-hot">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="card animate-pulse space-y-4 p-7">
            <div className="h-3 w-1/3 rounded bg-mist" />
            <div className="h-4 w-full rounded bg-snow" />
            <div className="h-4 w-3/4 rounded bg-snow" />
          </div>
          <div className="card animate-pulse space-y-4 p-7">
            <div className="h-3 w-1/4 rounded bg-mist" />
            <div className="h-10 rounded bg-snow" />
            <div className="h-12 rounded bg-mist" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <OrderSummary
            cart={state!.cart}
            products={state!.products}
            totalCents={totalCents || Object.entries(state!.cart).reduce((sum, [sku, qty]) => {
              const p = state!.products.find(p => p.sku === sku)
              return sum + (p ? p.price_cents * qty : 0)
            }, 0)}
          />

          {stripePromise && clientSecret ? (
            <Elements stripe={stripePromise}>
              <StripeCardForm
                clientSecret={clientSecret}
                totalCents={totalCents}
                items={items}
                onSuccess={handleSuccess}
              />
            </Elements>
          ) : (
            <FallbackPaymentForm
              totalCents={totalCents}
              items={items}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      )}
    </div>
  )
}
