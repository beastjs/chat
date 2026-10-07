import type {ChatAdapter, ChatIdentity} from '../core/adapter'
import type {Conversation, Message} from '../core/types'

export interface MemoryChatOptions {
  identity: ChatIdentity
  conversations: readonly Conversation[]
  messages?: Readonly<Record<string, readonly Message[]>>
}

/** Local sandbox only; creates no network connection and persists no data. */
export function createMemoryAdapter(options: MemoryChatOptions): ChatAdapter {
  let conversations = [...options.conversations]
  const messages = new Map(Object.entries(options.messages ?? {}).map(([fid, values]) => [fid, [...values]]))
  const conversationListeners = new Set<(values: readonly Conversation[]) => void>()
  const messageListeners = new Map<string, Set<() => void>>()
  const notify = (fid: string) => {
    for (const listener of messageListeners.get(fid) ?? []) listener()
    for (const listener of conversationListeners) listener(conversations)
  }
  return {
    subscribeConversations(listener) {
      conversationListeners.add(listener)
      listener(conversations)
      return () => { conversationListeners.delete(listener) }
    },
    subscribeMessages(fid, limit, listener) {
      const emit = () => {
        const history = messages.get(fid) ?? []
        listener({messages: history.slice(-limit), hasMore: history.length > limit})
      }
      const listeners = messageListeners.get(fid) ?? new Set()
      listeners.add(emit)
      messageListeners.set(fid, listeners)
      emit()
      return () => {
        listeners.delete(emit)
        if (!listeners.size) messageListeners.delete(fid)
      }
    },
    async sendMessage(fid, content, attachments) {
      const conversation = conversations.find(item => (item.otherUser?.proId ?? item.otherUser?.fid) === fid)
      if (!conversation) throw new Error('Conversation not found')
      if (!content.trim() && !attachments?.length) return
      const message: Message = {
        _id: crypto.randomUUID(), senderId: options.identity.id,
        receiverId: conversation.otherUserId, content: content.trim(),
        createdAt: new Date().toISOString(), readAt: null,
        ...(attachments?.length ? {attachments: [...attachments]} : {}),
      }
      messages.set(fid, [...(messages.get(fid) ?? []), message])
      conversations = conversations.map(item => item === conversation ? {...item, lastMessage: message, hasMessages: true} : item)
      notify(fid)
    },
    async markAsRead(fid) {
      const now = new Date().toISOString()
      messages.set(fid, (messages.get(fid) ?? []).map(message => message.receiverId === options.identity.id && !message.readAt ? {...message, readAt: now} : message))
      conversations = conversations.map(item => (item.otherUser?.proId ?? item.otherUser?.fid) === fid ? {...item, unreadCount: 0} : item)
      notify(fid)
    },
    async toggleLike(id) {
      for (const [fid, history] of messages) {
        const index = history.findIndex(message => message._id === id)
        if (index < 0) continue
        const message = history[index]!
        const likes = message.likes ?? []
        const updated = likes.some(like => like.userId === options.identity.id)
          ? likes.filter(like => like.userId !== options.identity.id)
          : [...likes, {userId: options.identity.id, likedAt: new Date().toISOString()}]
        messages.set(fid, history.map((item, i) => i === index ? {...message, likes: updated} : item))
        notify(fid)
        return
      }
      throw new Error('Message not found')
    },
  }
}
