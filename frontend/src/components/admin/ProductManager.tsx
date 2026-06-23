import { useEffect, useState } from 'react'
import { catalogApi, Product, ProductCreateInput, ProductUpdateInput } from '../../api/catalog'

const INPUT = 'w-full rounded-input border border-mist bg-white px-3 py-2 text-sm text-obsidian focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20'

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—')
const toCents = (dollars: string) => Math.round(parseFloat(dollars || '0') * 100)
const toDollars = (cents: number) => (cents / 100).toFixed(2)

type Toast = { kind: 'ok' | 'error'; text: string } | null

/**
 * Admin product + inventory management.
 *
 * `demo` swaps the persistence layer for in-memory local state (no backend).
 * In real mode it calls the catalog_service CRUD endpoints; the customer
 * Products page reflects the changes after refresh.
 */
export default function ProductManager({ demo = false, initialProducts = [] }: { demo?: boolean; initialProducts?: Product[] }) {
  const [products, setProducts] = useState<Product[]>(demo ? initialProducts : [])
  const [loading, setLoading] = useState(!demo)
  const [toast, setToast] = useState<Toast>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const flash = (t: Toast) => { setToast(t); if (t) setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    if (demo) return
    catalogApi.listAllProducts()
      .then(setProducts)
      .catch(e => flash({ kind: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [demo])

  // ── persistence (real vs demo) ──────────────────────────────────────────
  const reload = async () => {
    if (demo) return
    setProducts(await catalogApi.listAllProducts())
  }

  const handleCreate = async (input: ProductCreateInput) => {
    if (demo) {
      if (products.some(p => p.sku === input.sku)) throw new Error('SKU already exists')
      const now = new Date().toISOString()
      setProducts(prev => [...prev, {
        sku: input.sku, name: input.name, description: input.description,
        price_cents: input.price_cents, stock_available: input.stock_quantity,
        is_active: input.is_active, created_at: now, updated_at: now,
      }].sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      await catalogApi.createProduct(input)
      await reload()
    }
    flash({ kind: 'ok', text: `Product ${input.sku} created` })
  }

  const handleUpdate = async (sku: string, input: ProductUpdateInput) => {
    if (demo) {
      setProducts(prev => prev.map(p => p.sku === sku ? {
        ...p,
        name: input.name ?? p.name,
        description: input.description ?? p.description,
        price_cents: input.price_cents ?? p.price_cents,
        stock_available: input.stock_quantity ?? p.stock_available,
        is_active: input.is_active ?? p.is_active,
        updated_at: new Date().toISOString(),
      } : p))
    } else {
      await catalogApi.updateProduct(sku, input)
      await reload()
    }
    flash({ kind: 'ok', text: `Product ${sku} updated` })
  }

  const handleDeactivate = async (sku: string) => {
    if (demo) {
      setProducts(prev => prev.map(p => p.sku === sku ? { ...p, is_active: false, updated_at: new Date().toISOString() } : p))
    } else {
      await catalogApi.deactivateProduct(sku)
      await reload()
    }
    flash({ kind: 'ok', text: `Product ${sku} deactivated` })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow">Product Management</h2>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">+ Add product</button>
      </div>

      {toast && (
        <div className={`mb-3 rounded-input px-4 py-2.5 text-sm ${toast.kind === 'ok' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-ember/30 bg-ember/5 text-ember-hot'}`}>
          {toast.text}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-ash">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="p-6 text-sm text-ash">No products yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mist bg-snow">
                {['Product', 'Price', 'Stock', 'Status', 'Updated', ''].map((h, i) => (
                  <th key={i} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ash">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {products.map(p => (
                <tr key={p.sku} className={`transition-colors hover:bg-snow ${p.is_active ? '' : 'opacity-60'}`}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-obsidian">{p.name}</p>
                    <p className="font-mono text-xs text-pewter">{p.sku}</p>
                  </td>
                  <td className="px-5 py-3 text-slate2">{fmt(p.price_cents)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${p.stock_available === 0 ? 'text-ember-hot' : p.stock_available < 20 ? 'text-amber-500' : 'text-emerald-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.stock_available === 0 ? 'bg-ember' : p.stock_available < 20 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      {p.stock_available}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-mist text-slate2'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ash">{fmtDate(p.updated_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setEditing(p)} className="font-medium text-ember hover:text-ember-hot">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <ProductForm
          title="Add product"
          submitLabel="Create product"
          onClose={() => setAdding(false)}
          onSubmit={async values => { await handleCreate(values as ProductCreateInput) }}
        />
      )}
      {editing && (
        <ProductForm
          title={`Edit ${editing.name}`}
          submitLabel="Save changes"
          product={editing}
          onClose={() => setEditing(null)}
          onSubmit={async values => { await handleUpdate(editing.sku, values) }}
          onDeactivate={editing.is_active ? async () => { await handleDeactivate(editing.sku); setEditing(null) } : undefined}
        />
      )}
    </div>
  )
}

// ── Add / Edit modal form ────────────────────────────────────────────────
function ProductForm({
  title, submitLabel, product, onClose, onSubmit, onDeactivate,
}: {
  title: string
  submitLabel: string
  product?: Product
  onClose: () => void
  onSubmit: (values: ProductCreateInput | ProductUpdateInput) => Promise<void>
  onDeactivate?: () => Promise<void>
}) {
  const isEdit = !!product
  const [sku, setSku] = useState(product?.sku ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(product ? toDollars(product.price_cents) : '')
  const [stock, setStock] = useState(product ? String(product.stock_available) : '0')
  const [active, setActive] = useState(product?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!isEdit && !sku.trim()) return setErr('SKU is required')
    if (!name.trim()) return setErr('Name is required')
    setBusy(true)
    try {
      const base = {
        name: name.trim(),
        description: description.trim(),
        price_cents: toCents(price),
        stock_quantity: Math.max(0, parseInt(stock || '0', 10)),
        is_active: active,
      }
      await onSubmit(isEdit ? base : { sku: sku.trim(), ...base })
      onClose()
    } catch (e: any) {
      setErr(e.message ?? 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card border border-mist bg-white p-6 shadow-soft" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-obsidian">{title}</h3>
          <button onClick={onClose} className="text-ash hover:text-obsidian">✕</button>
        </div>

        {err && <div className="mb-3 rounded-input border border-ember/30 bg-ember/5 px-3 py-2 text-sm text-ember-hot">{err}</div>}

        <form onSubmit={submit} className="space-y-3">
          {!isEdit && (
            <Field label="SKU">
              <input value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU-EXAMPLE" className={INPUT} />
            </Field>
          )}
          <Field label="Product name">
            <input value={name} onChange={e => setName(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${INPUT} resize-none`} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (USD)">
              <input value={price} onChange={e => setPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className={INPUT} />
            </Field>
            <Field label="Stock quantity">
              <input value={stock} onChange={e => setStock(e.target.value)} type="number" min="0" step="1" className={INPUT} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate2">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4 accent-ember" />
            Active (visible to customers)
          </label>

          <div className="flex items-center justify-between pt-2">
            {onDeactivate ? (
              <button type="button" onClick={onDeactivate} className="text-sm font-medium text-ember-hot hover:underline">Deactivate</button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-ghost btn-sm">Cancel</button>
              <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy ? 'Saving…' : submitLabel}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">{label}</span>
      {children}
    </label>
  )
}
