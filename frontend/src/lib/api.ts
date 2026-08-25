/**
 * Centralized API Client Wrapper
 * Handles JWT Bearer authorization, error handling, and JSON parsing.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface RequestOptions extends RequestInit {
  token?: string
}

export class ApiError extends Error {
  status: number
  data: any

  constructor(status: number, message: string, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

import { toast } from 'sonner'

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = options.token || localStorage.getItem('access_token')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // 25-second fetch timeout safeguard for LLM calls
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25000)

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort()
    } else {
      options.signal.addEventListener('abort', () => {
        controller.abort()
      })
    }
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.status === 204) {
      return null as any
    }

    let data: any
    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && !endpoint.includes('/auth/login')) {
        // Clear stale session
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')

        try {
          toast.error("Session expired due to inactivity. Please log in again.")
        } catch {}

        sessionStorage.setItem('session_expired', 'true')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
      let detail = data?.detail
      if (Array.isArray(detail)) {
        detail = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ')
      } else if (typeof detail === 'object' && detail !== null) {
        detail = JSON.stringify(detail)
      }
      if (!detail || response.status >= 500) {
        detail = "We're working heads down to service you! Give us a quick moment and try again. 🚀"
      }
      throw new ApiError(response.status, detail, data)
    }

    return data as T
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new ApiError(408, "We're working heads down to service you! Give us a quick moment and try again. 🚀")
    }
    if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
      throw new ApiError(503, "We're working heads down to service you! Give us a quick moment and try again. 🚀")
    }
    throw err
  }
}

export const api = {
  get: <T>(endpoint: string, token?: string) =>
    apiRequest<T>(endpoint, { method: 'GET', token }),
  
  post: <T>(endpoint: string, body: any, token?: string) =>
    apiRequest<T>(endpoint, { method: 'POST', body: JSON.stringify(body), token }),
  
  put: <T>(endpoint: string, body: any, token?: string) =>
    apiRequest<T>(endpoint, { method: 'PUT', body: JSON.stringify(body), token }),
  
  delete: <T>(endpoint: string, token?: string) =>
    apiRequest<T>(endpoint, { method: 'DELETE', token }),
}
