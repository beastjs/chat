import {createMemoryAdapter} from '@beast-chat/chat/memory'
import type {ChatIdentity, Conversation, Message} from '@beast-chat/chat/core'

export const identity: ChatIdentity = {id: 'demo-you', fid: 'demo-you', name: 'Alex Morgan'}
const recent = [
  ['demo-support', 'Hey Alex! How’s the chat feeling on your phone?'],
  ['demo-you', 'Much better. I want it to feel quiet, fast, and a little more considered.'],
  ['demo-support', 'That’s the idea. A little less noise, a little more room to talk.'],
  ['demo-you', 'The monochrome look is really working. Keep that small orange accent.'],
  ['demo-support', 'Done. Try scrolling back through the conversation — your reading position stays put.'],
  ['demo-you', 'Nice. And when I send something?'],
  ['demo-support', 'It settles into the conversation with a soft transition. Go ahead, send a message.'],
]
const history: Message[] = Array.from({length: 360}, (_, index) => ({
  _id: `demo-history-${index}`, senderId: index % 2 ? identity.id : 'demo-support', receiverId: index % 2 ? 'demo-support' : identity.id,
  content: index % 2 ? 'That sounds good. Let’s keep it simple.' : 'A small detail, but it makes the conversation feel better.',
  createdAt: new Date(Date.UTC(2026, 9, 4, 8, index)).toISOString(), readAt: '2026-10-04T16:00:00.000Z',
}))
const supportMessages = [...history, ...recent.map(([senderId, content], index): Message => ({
  _id: `demo-recent-${index}`, senderId: senderId!, receiverId: senderId === identity.id ? 'demo-support' : identity.id,
  content: content!, createdAt: new Date(Date.UTC(2026, 9, 5, 9, 34 + index)).toISOString(), readAt: '2026-10-05T10:00:00.000Z',
}))]
const people = [
  {id: 'demo-support', name: 'Jamie Lee', email: 'jamie@example.com', preview: supportMessages.at(-1)!.content, unread: 0},
  {id: 'demo-design', name: 'Design studio', email: 'studio@example.com', preview: 'The little details make all the difference.', unread: 2},
  {id: 'demo-weekend', name: 'Weekend plans', email: 'weekend@example.com', preview: 'Coffee first, everything else later.', unread: 0},
  {id: 'demo-notes', name: 'Maya Chen', email: 'maya@example.com', preview: 'Thanks for the thoughtful feedback ✨', unread: 0},
]
const conversations: Conversation[] = people.map(person => ({
  otherUserId: person.id, otherUser: {fid: person.id, name: person.name, email: person.email, photoUrl: null},
  lastMessage: {content: person.preview, createdAt: '2026-10-05T09:40:00.000Z'}, unreadCount: person.unread, hasMessages: true,
}))
export const adapter = createMemoryAdapter({identity, conversations, messages: Object.fromEntries(people.map(person => [person.id, person.id === 'demo-support' ? supportMessages : [{
  _id: `${person.id}-1`, senderId: person.id, receiverId: identity.id, content: person.preview, createdAt: '2026-10-05T09:00:00.000Z', readAt: null,
}]]))})
