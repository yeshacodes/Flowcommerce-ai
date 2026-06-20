import React, { createContext, useContext, useEffect, useState } from 'react'

interface AuthUser {
  email: string
  customer_id: string
  token: string
}

interface AuthContextValue {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem('fc_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const login = (u: AuthUser) => {
    setUser(u)
    localStorage.setItem('fc_user', JSON.stringify(u))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('fc_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
