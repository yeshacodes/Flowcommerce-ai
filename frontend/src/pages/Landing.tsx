import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { backendConfigured } from '../api/client'
import { GITHUB_URL } from '../data/demoData'

/**
 * Public marketing landing page at "/". Dark premium SaaS style matching the
 * FlowCommerce AI brand. No auth, no backend — links into the public demo and
 * the GitHub repo. The real app routes are untouched.
 */
const features = [
  { title: 'Event-driven saga', body: 'Choreographed order pipeline across independent services — inventory, payment, and notifications coordinate over Kafka with automatic rollback on failure.' },
  { title: 'Transactional outbox', body: 'Events are committed atomically with business data, then published by a poller — no dual-write race, no lost events.' },
  { title: 'Stripe payments', body: 'Real PaymentIntents with idempotency keys and a webhook reliability backstop, plus a simulated fallback for local runs.' },
  { title: 'Real-time observability', body: 'Health endpoints, Prometheus metrics, structured JSON logs with correlation IDs, Grafana dashboards, and an in-app Operations console.' },
  { title: 'Idempotent by design', body: 'At-least-once delivery with dedupe and state-machine guards — duplicate events are harmless and replays are safe.' },
  { title: 'Production patterns', body: 'JWT auth, admin RBAC, rate limiting, dead-letter queues, and optimistic-locked inventory reservation.' },
]

const techStack = [
  'FastAPI', 'Python', 'Apache Kafka (KRaft)', 'PostgreSQL', 'Redis', 'Stripe',
  'React', 'TypeScript', 'Tailwind CSS', 'Prometheus', 'Grafana', 'Docker',
]

const architecture = [
  ['order-service', 'Saga state machine + outbox + HTTP API'],
  ['inventory-service', 'Stock reservation with SAVEPOINT rollback'],
  ['payment-service', 'Stripe PaymentIntents / simulated fallback'],
  ['notification-service', 'Transactional email via Resend'],
  ['auth · catalog · webhook', 'JWT auth, product catalog, Stripe webhooks'],
]

function Button({ to, href, children, variant }: { to?: string; href?: string; children: React.ReactNode; variant: 'primary' | 'ghost' }) {
  const cls = variant === 'primary'
    ? 'bg-ember text-white hover:bg-ember-hot shadow-cta'
    : 'border border-white/20 text-white hover:bg-white/10'
  const base = `inline-flex items-center justify-center rounded-pill px-6 py-3 text-sm font-semibold transition-colors ${cls}`
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={base}>{children}</a>
  return <Link to={to!} className={base}>{children}</Link>
}

/**
 * Renders a screenshot from frontend/public/screenshots/ once it exists.
 * We probe the content-type instead of using <img onError>, because Vite's dev
 * server serves index.html (HTTP 200, text/html) for missing files — so onError
 * never fires. Until a real image is added, a labelled placeholder is shown.
 */
function Screenshot({ src, title }: { src: string; title: string }) {
  const [hasImage, setHasImage] = useState(false)
  useEffect(() => {
    let active = true
    fetch(src)
      .then(r => {
        const ct = r.headers.get('content-type') ?? ''
        if (active) setHasImage(r.ok && ct.startsWith('image/'))
      })
      .catch(() => active && setHasImage(false))
    return () => { active = false }
  }, [src])

  if (!hasImage) return <span className="text-sm text-white/30">{title} preview</span>
  return (
    <img
      src={src}
      alt={`${title} screenshot`}
      loading="lazy"
      className="h-full w-full object-cover object-top transition-transform group-hover:scale-[1.02]"
    />
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-obsidian text-white">
      {/* Nav */}
      <header className="mx-auto flex max-w-page items-center justify-between px-6 py-6">
        <div>
          <span className="text-lg font-bold tracking-tight">FlowCommerce</span>
          <span className="ml-1 text-lg font-bold text-ember">AI</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/demo/products" className="text-sm font-medium text-white/70 hover:text-white">Demo</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white/70 hover:text-white">GitHub</a>
          {/* Sign in is only meaningful when a backend is reachable (local dev or
              a configured deployment). In the public demo it's hidden as a quiet
              text link so it never looks like a broken primary action. */}
          {backendConfigured && (
            <Link to="/login" className="rounded-pill border border-white/15 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/10">Sign in</Link>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-0 h-[520px] w-[520px] rounded-full bg-ember/20 blur-[120px]" />
        <div className="mx-auto max-w-page px-6 py-24 text-center">
          <span className="inline-block rounded-pill border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-white/60">
            Commerce Operations Platform
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Operate your storefront with{' '}
            <span className="bg-gradient-to-r from-ember to-ember-hot bg-clip-text text-transparent">event-driven intelligence.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
            A production-grade commerce platform built with FastAPI microservices, Kafka event streaming,
            Saga orchestration, Stripe payments, and real-time observability.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button to="/demo/products" variant="primary">Explore Demo</Button>
            <Button href={GITHUB_URL} variant="ghost">View GitHub</Button>
          </div>
          <p className="mt-4 text-xs text-white/40">Public demo uses simulated data and does not require login.</p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-page px-6 py-20">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ash">Features</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(f => (
            <div key={f.title} className="rounded-card border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="mx-auto max-w-page px-6 py-20">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ash">Architecture</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          Independent microservices communicate exclusively over Kafka topics. No service calls another
          directly — they react to events, which keeps the system loosely coupled and resilient.
        </p>
        <div className="mt-6 divide-y divide-white/5 overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
          {architecture.map(([name, desc]) => (
            <div key={name} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-sm text-ember">{name}</span>
              <span className="text-sm text-white/55">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="mx-auto max-w-page px-6 py-20">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ash">Tech Stack</h2>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {techStack.map(t => (
            <span key={t} className="rounded-pill border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">{t}</span>
          ))}
        </div>
      </section>

      {/* Screenshots */}
      <section className="mx-auto max-w-page px-6 py-20">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ash">Screenshots</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            // src: file under frontend/public/screenshots/ (served from site root).
            // Drop the PNGs there and they appear automatically.
            ['Products', 'Catalog with live stock and cart-aware checkout', '/screenshots/products.png'],
            ['Order Detail', 'Real-time saga timeline + Stripe payment panel', '/screenshots/order-detail.png'],
            ['Operations', 'System health, KPIs, and an event explorer', '/screenshots/operations.png'],
          ].map(([title, caption, src]) => (
            <Link key={title} to="/demo/products" className="group overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
              <div className="flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-white/[0.04] to-ember/10">
                <Screenshot src={src} title={title} />
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs text-white/50">{caption}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-page px-6 py-24">
        <div className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03] px-8 py-16 text-center">
          <div className="pointer-events-none absolute -bottom-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-ember/20 blur-[110px]" />
          <h2 className="relative text-2xl font-bold sm:text-3xl">See the whole pipeline in motion.</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-white/55">
            Browse the catalog, place an order, and watch the saga flow through inventory, payment, and
            confirmation — all in the live demo, no setup required.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button to="/demo/products" variant="primary">Explore Demo</Button>
            <Button href={GITHUB_URL} variant="ghost">View GitHub</Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-white/40 sm:flex-row">
          <span>© 2026 FlowCommerce AI</span>
          <span>Built with FastAPI · Kafka · Stripe · React</span>
        </div>
      </footer>
    </div>
  )
}
