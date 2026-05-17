import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { profileRepository } from '../repositories/profileRepository.js'
import { SocketContext } from './socketContext.js'

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const listenersRef = useRef(new Map())

  useEffect(() => {
    let active = true
    let removeSimulatedPushListener = () => {}
    const listenerRegistry = listenersRef.current

    async function connectToSocket() {
      try {
        await profileRepository.getCurrentUserProfile().catch(() => null)

        if (!active) return

        const mockSocket = {
          id: `socket_${Date.now()}`,
          on: (event, callback) => {
            const eventCallbacks = listenerRegistry.get(event) || []
            listenerRegistry.set(event, [...eventCallbacks, callback])
          },
          off: (event, callback) => {
            const eventCallbacks = listenerRegistry.get(event) || []
            const nextCallbacks = eventCallbacks.filter(
              (registeredCallback) => registeredCallback !== callback,
            )

            if (nextCallbacks.length) {
              listenerRegistry.set(event, nextCallbacks)
            } else {
              listenerRegistry.delete(event)
            }
          },
          emit: (event, data) => {
            console.log(`[Socket Mock] Emitting ${event}`, data)
          },
        }

        setSocket(mockSocket)
        setIsConnected(true)

        function handleSimulatedSocketPush(event) {
          const { event: socketEvent, payload } = event.detail
          const callbacks = listenerRegistry.get(socketEvent) || []
          callbacks.forEach((callback) => callback(payload))
        }

        window.addEventListener('simulated_socket_push', handleSimulatedSocketPush)
        removeSimulatedPushListener = () => {
          window.removeEventListener('simulated_socket_push', handleSimulatedSocketPush)
        }
      } catch (error) {
        console.error('Failed to connect to socket', error)
      }
    }

    connectToSocket()

    return () => {
      active = false
      removeSimulatedPushListener()
      listenerRegistry.clear()
      setIsConnected(false)
    }
  }, [])

  const subscribe = useCallback((event, callback) => {
    if (!socket) return () => {}

    socket.on(event, callback)
    return () => socket.off(event, callback)
  }, [socket])

  const value = useMemo(
    () => ({ socket, isConnected, subscribe }),
    [isConnected, socket, subscribe],
  )

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}
