import {normalizeMessageLimit} from '../core/message-limit'
import type {ConvexClient} from 'convex/browser'
import {makeFunctionReference} from 'convex/server'
import type {ChatAdapter, ChatIdentity} from '../core/adapter'
import type {Attachment, Conversation, Message} from '../core/types'

export interface ConvexChatOptions {
  /** Authenticated, host-owned client; the library never closes it. */
  client: ConvexClient
  identity: ChatIdentity
  /** Existing rf endpoints are the default. Override when deploying bounded queries. */
  functions?: Partial<{conversations: string; messages: string; send: string; read: string; like: string}>
}

/** Compatibility adapter for rf. Its legacy queries still fetch full histories. */
export function createConvexAdapter({client, identity, functions = {}}: ConvexChatOptions): ChatAdapter {
  const conversations = makeFunctionReference<'query', {fid: string}, Conversation[]>(functions.conversations ?? 'messages/q:getConversations')
  const messages = makeFunctionReference<'query', {currentUserId: string; otherUserId: string}, Message[]>(functions.messages ?? 'messages/q:getMessages')
  const send = makeFunctionReference<'mutation', {senderId: string; receiverId: string; content: string; attachments?: Omit<Attachment, 'url'>[]}, unknown>(functions.send ?? 'messages/m:sendMessage')
  const read = makeFunctionReference<'mutation', {senderfid: string; receiverfid: string}, unknown>(functions.read ?? 'messages/m:markAsRead')
  const like = makeFunctionReference<'mutation', {messageId: string; userfid: string}, unknown>(functions.like ?? 'messages/m:likeMessage')
  return {
    subscribeConversations: (callback, onError) => client.onUpdate(conversations, {fid: identity.fid}, callback, onError),
    subscribeMessages: (fid, limit, callback, onError) => client.onUpdate(messages, {currentUserId: identity.fid, otherUserId: fid}, values => callback({messages: values.slice(-normalizeMessageLimit(limit)), hasMore: values.length > normalizeMessageLimit(limit)}), onError),
    async sendMessage(fid, content, attachments) {
      await client.mutation(send, {senderId: identity.fid, receiverId: fid, content, ...(attachments?.length ? {attachments: attachments.map(({url, ...attachment}) => attachment)} : {})})
    },
    async markAsRead(fid) { await client.mutation(read, {senderfid: fid, receiverfid: identity.fid}) },
    async toggleLike(messageId) { await client.mutation(like, {messageId, userfid: identity.fid}) },
  }
}
