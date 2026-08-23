import React, { createContext, useContext, useState, useEffect } from 'react'
import { User, TokenResponse } from '../types'
import { api, ApiError } from '../lib/api'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (data: any) => Promise<User>
  register: (data: any) => Promise<User>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'))
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const saveTokens = (data: TokenResponse) => {
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setToken(data.access_token)
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setToken(null)
    setUser(null)
  }

  const refreshUser = async () => {
    const currentToken = localStorage.getItem('access_token')
    if (!currentToken) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const userData = await api.get<User>('/auth/me', currentToken)
      setUser(userData)
    } catch (err) {
      console.error('Auth verification failed:', err)
      logout()
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshUser()
  }, [])

  const login = async (loginData: any): Promise<User> => {
    const data = await api.post<TokenResponse>('/auth/login', loginData)
    saveTokens(data)
    return data.user
  }

  const register = async (registerData: any): Promise<User> => {
    const data = await api.post<TokenResponse>('/auth/register', registerData)
    saveTokens(data)
    return data.user
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
