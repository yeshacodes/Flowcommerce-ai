import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Products from './pages/Products'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Admin from './pages/Admin'
import Operations from './pages/Operations'
import Copilot from './pages/Copilot'
import Checkout from './pages/Checkout'
// Public landing + demo layer (no auth, no backend) — additive, separate from the real app.
import Landing from './pages/Landing'
import DemoLayout from './components/demo/DemoLayout'
import DemoProducts from './pages/demo/DemoProducts'
import DemoOrders from './pages/demo/DemoOrders'
import DemoOrderDetail from './pages/demo/DemoOrderDetail'
import DemoOperations from './pages/demo/DemoOperations'
import DemoAdmin from './pages/demo/DemoAdmin'

function AdminRoute() {
  const { user } = useAuth()
  return user?.is_admin ? <Outlet /> : <Navigate to="/products" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public landing + demo (no login, no backend) */}
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<Navigate to="/demo/products" replace />} />
          <Route element={<DemoLayout />}>
            <Route path="/demo/products" element={<DemoProducts />} />
            <Route path="/demo/orders" element={<DemoOrders />} />
            <Route path="/demo/orders/:id" element={<DemoOrderDetail />} />
            <Route path="/demo/operations" element={<DemoOperations />} />
            <Route path="/demo/admin" element={<DemoAdmin />} />
            <Route path="/demo/copilot" element={<Copilot demo />} />
          </Route>

          {/* Real application (unchanged) */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/products" element={<Products />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
                <Route path="/operations" element={<Operations />} />
                <Route path="/copilot" element={<Copilot />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
