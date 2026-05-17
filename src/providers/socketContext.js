import { createContext, useContext, useEffect } from 'react'

export const SocketContext = createContext(null)

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket deve ser usado dentro de um SocketProvider')
  }

  return context
}

export function useSocketEvent(event, callback) {
  const { subscribe } = useSocket()

  useEffect(() => {
    return subscribe(event, callback)
  }, [callback, event, subscribe])
}
