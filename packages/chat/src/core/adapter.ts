import type {Attachment, Conversation, Message} from './types'

export interface ChatIdentity {
  /** Backend participant ID, distinct from auth fid. */
  id: string
  fid: string
  name: string
}

export interface MessageWindow {
  messages: readonly Message[]
  hasMore: boolean
}

export type Unsubscribe = () => void
export type OnError = (error: Error) => void

/** Subscriptions return oldest-first messages, bounded by limit. */
export interface ChatAdapter {
  subscribeConversations(onValue: (value: readonly Conversation[]) => void, onError: OnError): Unsubscribe
  subscribeMessages(otherFid: string, limit: number, onValue: (value: MessageWindow) => void, onError: OnError): Unsubscribe
  sendMessage(otherFid: string, content: string, attachments?: readonly Attachment[]): Promise<void>
  markAsRead?(otherFid: string): Promise<void>
  toggleLike?(messageId: string): Promise<void>
  upload?(file: File, signal?: AbortSignal): Promise<Attachment>
}
