import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { profileRepository } from '../repositories/profileRepository.js'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [listeners, setListeners] = useState(new Map())

  useEffect(() => {
    let active = true

    // Simulate establishing a WebSocket connection
    const connectToSocket = async () => {
      try {
        const profile = await profileRepository.getCurrentUserProfile().catch(() => null)
        
        if (!active) return

        // In a real environment, you would use:
        // import { io } from 'socket.io-client'
        // const socketInstance = io('https://api.mediconnect.com', { auth: { token: '...' } })
        
        // MOCK IMPLEMENTATION
        const mockSocket = {
          id: `socket_${Date.now()}`,
          on: (event, callback) => {
            setListeners(prev => {
              const newListeners = new Map(prev)
              const eventCallbacks = newListeners.get(event) || []
              newListeners.set(event, [...eventCallbacks, callback])
              return newListeners
            })
          },
          off: (event, callback) => {
            setListeners(prev => {
              const newListeners = new Map(prev)
              const eventCallbacks = newListeners.get(event) || []
              newListeners.set(event, eventCallbacks.filter(cb => cb !== callback))
              return newListeners
            })
          },
          emit: (event, data) => {
            console.log(`[Socket Mock] Emitting ${event}`, data)
          }
        }

        setSocket(mockSocket)
        setIsConnected(true)

        // Mock event receiver to simulate real-time pushes for demo purposes
        window.addEventListener('simulated_socket_push', (e) => {
          const { event, payload } = e.detail
          setListeners(currentListeners => {
            const callbacks = currentListeners.get(event) || []
            callbacks.forEach(cb => cb(payload))
            return currentListeners
          })
        })

      } catch (err) {
        console.error('Failed to connect to socket', err)
      }
    }

    connectToSocket()

    return () => {
      active = false
      if (socket) {
        // socket.disconnect() // Real implementation
        setIsConnected(false)
      }
    }
  }, []) // Empty dependency array as we connect once per app mount

  // Utility hook to register events safely
  const useSocketEvent = useCallback((event, callback) => {
    useEffect(() => {
      if (!socket) return

      socket.on(event, callback)
      return () => {
        socket.off(event, callback)
      }
    }, [socket, event, callback])
  }, [socket])

  return (
    <SocketContext.Provider value={{ socket, isConnected, useSocketEvent }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket deve ser usado dentro de um SocketProvider')
  }
  return context
}
