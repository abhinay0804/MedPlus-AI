import { useEffect, useRef, useState } from 'react'

interface WebSocketMessage {
  event: string
  appointment_id?: string
  payload?: any
  [key: string]: any
}

export function useWebSocket(appointmentId?: string, onMessage?: (data: WebSocketMessage) => void) {
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)

  // Keep callback reference updated without triggering WebSocket re-connections
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!appointmentId) return

    const token = localStorage.getItem('access_token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/appointments/${appointmentId}?token=${token}`

    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      console.log(`[WS] Connected to appointment ${appointmentId}`)
    }

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data)
        if (onMessageRef.current) {
          onMessageRef.current(data)
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      console.log(`[WS] Disconnected from appointment ${appointmentId}`)
    }

    ws.onerror = (err) => {
      console.error('[WS] Error:', err)
    }

    return () => {
      ws.close()
    }
  }, [appointmentId]) // Strictly depend ONLY on appointmentId, not callback ref!

  return { isConnected }
}
