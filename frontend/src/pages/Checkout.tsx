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
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Order Summary</h2>
      <div className="space-y-3 mb-5">
        {Object.entries(cart).map(([sku, qty]) => {
          const product = products.find(p => p.sku === sku)
          if (!product) return null
          return (
            <div key={sku} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-400">Qty {qty} × {fmt(product.price_cents)}</p>
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {fmt(product.price_cents * qty)}
              </p>
            </div>
          )
        })}
      </div>
      <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
        <span className="text-sm font-semibold text-slate-700">Total</span>
        <span className="text-xl font-bold text-slate-900">{fmt(totalCents)}</span>
      </div>
    </div>
  )
}

// ── Stripe card form (rendered inside <Elements>) ───────────────────────────

const CARD_STYLE = {
  style: {
    base: {
      color: '#0f172a',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: { color: '#ef4444', iconColor: '#ef4444' },
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
      <div className="bg-white border border-slate-200 rounded-xl p-6">

        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h2 className="text-sm font-semibold text-slate-700">Secure Payment</h2>
        </div>

        {/* Card input */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Card details
          </label>
          <div className="border border-slate-300 rounded-lg px-3 py-3 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
            <CardElement options={CARD_STYLE} />
          </div>
        </div>

        {/* Test card hint */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-5">
          <p className="text-xs font-semibold text-blue-700 mb-1">Test card</p>
          <p className="text-xs text-blue-600 font-mono">4242 4242 4242 4242</p>
          <p className="text-xs text-blue-500 mt-0.5">Any future expiry · Any 3-digit CVC · Any ZIP</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5 mb-4">
            {error}
          </div>
        )}

        {/* Pay button */}
        <button
          type="submit"
          disabled={!stripe || paying}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-lg transition-colors"
        >
          {paying ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <svg className="h-4" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.87zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.84zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.5 0 3 .07 4.46.48V9.1c-1.36-.4-2.96-.84-4.46-.84-.86 0-1.44.23-1.44.85 0 1.85 6.29.97 6.29 5.69z" fill="#6772E5"/>
          </svg>
          <span className="text-xs text-slate-400">Powered by Stripe</span>
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
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-700">Payment</h2>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
        <p className="text-xs font-semibold text-amber-700 mb-0.5">Stripe not configured</p>
        <p className="text-xs text-amber-600">
          Add <code className="font-mono bg-amber-100 px-1 rounded">VITE_STRIPE_PUBLIC_KEY</code> to
          your frontend <code className="font-mono bg-amber-100 px-1 rounded">.env</code> to enable
          real card payments. Using simulated payment for now.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5 mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handlePlace}
        disabled={placing}
        className="w-full bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-lg transition-colors"
      >
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
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <button onClick={() => navigate('/products')} className="hover:text-slate-600 transition-colors">
          Products
        </button>
        <span>›</span>
        <span className="text-slate-600 font-medium">Checkout</span>
      </div>

      <h1 className="text-xl font-semibold text-slate-900 mb-6">Checkout</h1>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Summary skeleton */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-4">
            <div className="h-3 bg-slate-200 rounded w-1/3" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-4 bg-slate-100 rounded w-5/6" />
          </div>
          {/* Payment skeleton */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-4">
            <div className="h-3 bg-slate-200 rounded w-1/4" />
            <div className="h-10 bg-slate-100 rounded" />
            <div className="h-12 bg-slate-200 rounded" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
