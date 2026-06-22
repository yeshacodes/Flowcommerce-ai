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
import Checkout from './pages/Checkout'

function AdminRoute() {
  const { user } = useAuth()
  return user?.is_admin ? <Outlet /> : <Navigate to="/products" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/products" replace />} />
              <Route path="/products" element={<Products />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/products" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
