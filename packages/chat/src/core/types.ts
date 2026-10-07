/** Opaque application IDs. The core does not depend on Convex or Firebase. */
export type ParticipantId = string
export type MessageId = string
export type StorageId = string

export interface Attachment {
  storageId: StorageId
  fileName: string
  fileType: string
  fileSize: number
  url: string | null
}

export interface Message {
  _id: MessageId
  senderId: ParticipantId
  receiverId: ParticipantId
  content: string
  createdAt: string
  readAt: string | null
  attachments?: Attachment[]
  likes?: Array<{userId: ParticipantId; likedAt: string}>
}

/** Auth identity (fid) may differ from a participant's storage ID. */
export interface OtherUser {
  fid: string
  name: string | null
  email: string
  photoUrl: string | null
  proId?: string
  displayName?: string | null
  avatarUrl?: string | null
  locationLabel?: string | null
  lastActiveAt?: number | null
}

export interface LastMessage {
  _id?: MessageId | null
  content: string
  createdAt: string
  senderId?: ParticipantId
  receiverId?: ParticipantId
  attachments?: Attachment[]
}

export interface Conversation {
  otherUserId: ParticipantId
  otherUser: OtherUser | null
  lastMessage: LastMessage
  unreadCount: number
  hasMessages: boolean
  folderId?: string | null
  folderName?: string | null
}

export interface ConversationFolderSummary {
  _id: string
  name: string
}

export interface ConversationFolderState {
  enabled: boolean
  folders: ConversationFolderSummary[]
}

export interface AssistantMessage {
  id: MessageId
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type MessagePresentation = 'default' | 'widget'

export interface MessageGroup {
  date: string
  messages: Message[]
}
