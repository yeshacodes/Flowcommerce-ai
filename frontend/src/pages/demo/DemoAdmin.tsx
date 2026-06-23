import ProductManager from '../../components/admin/ProductManager'
import { demoProducts } from '../../data/demoData'

/**
 * Demo admin product management. Uses ProductManager in demo mode, which keeps
 * all CRUD in local React state — no backend calls, no login.
 */
export default function DemoAdmin() {
  return (
    <div className="mx-auto max-w-page px-8 py-10">
      <div className="mb-8">
        <span className="eyebrow">Operations</span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-obsidian">Admin</h1>
        <p className="mt-1 text-sm text-ash">Manage products and inventory. Changes are kept in-memory for this demo.</p>
      </div>
      <ProductManager demo initialProducts={demoProducts} />
    </div>
  )
}
