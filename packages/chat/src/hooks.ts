import {flushSync, useEffect, useRef, useState} from 'octane'
import {transitionSentMessage} from './message-transition'
import type {ChatAdapter, MessageWindow} from './core/adapter'
import type {Conversation} from './core/types'

const emptyConversations: readonly Conversation[] = []
const emptyWindow: MessageWindow = {messages: [], hasMore: false}

export function useConversations(adapter: ChatAdapter) {
  const [data, setData] = useState(emptyConversations)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const unsubscribe = adapter.subscribeConversations(values => {
      if (!active) return
      setData(values)
      setLoading(false)
      setError(null)
    }, cause => {
      if (!active) return
      setError(cause.message)
      setLoading(false)
    })
    return () => { active = false; unsubscribe() }
  }, [adapter])
  return {data, loading, error}
}

export function useMessages(adapter: ChatAdapter, fid: string, limit: number, senderId?: string, onOutgoing?: () => void) {
  const [data, setData] = useState(emptyWindow)
  const [enteringId, setEnteringId] = useState<string | null>(null)
  const [entryMotion, setEntryMotion] = useState<'native' | 'fallback'>('native')
  const afterCommit = useRef(onOutgoing)
  afterCommit.current = onOutgoing
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let previous: MessageWindow | null = null
    let cancelArrival: (() => void) | undefined
    const unsubscribe = adapter.subscribeMessages(fid, limit, values => {
      if (!active) return
      const last = values.messages.at(-1)
      const oldLast = previous?.messages.at(-1)
      const outgoing = !!last && senderId !== undefined && previous !== null && last.senderId === senderId && last?._id !== oldLast?._id && (!oldLast || values.messages.some(message => message._id === oldLast._id))
      previous = values
      const update = () => {
        if (!active || previous !== values) return
        setData(values); setEnteringId(outgoing ? last!._id : null); setLoading(false); setError(null)
      }
      if (outgoing) {
        // Remove the previous bubble's name before the old snapshot. Only the
        // newly inserted bubble should participate in this arrival.
        cancelArrival?.()
        flushSync(() => { setEnteringId(null); setEntryMotion('native') })
        cancelArrival = transitionSentMessage(update, () => {
          if (active && previous?.messages.at(-1)?._id === last!._id) flushSync(() => setEntryMotion('fallback'))
        }, () => { if (active && previous === values) afterCommit.current?.() }, () => {
          if (active && previous === values) flushSync(() => setEnteringId(null))
        })
      } else update()
    }, cause => {
      if (!active) return
      setError(cause.message)
      setLoading(false)
    })
    return () => { active = false; cancelArrival?.(); unsubscribe() }
  }, [adapter, fid, limit, senderId])
  return {data, loading, error, enteringId, entryMotion}
}

/** Visual viewport follows the mobile keyboard; resize work is frame-batched. */
export function useViewportHeight() {
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const viewport = window.visualViewport
    let frame: number | null = null
    const measure = () => { frame = null; setHeight(viewport?.height ?? window.innerHeight) }
    const resize = () => {
      if (typeof requestAnimationFrame !== 'function') { measure(); return }
      if (frame === null) frame = requestAnimationFrame(measure)
    }
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      window.removeEventListener('resize', resize)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])
  return height
}
