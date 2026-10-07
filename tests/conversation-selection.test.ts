import {describe, expect, test} from 'bun:test'
import {
  resolveActiveConversationFid,
  shouldShowConversationSelector,
} from '../packages/chat/src/core/conversation-selection'

const mkConversation = (fid: string) => ({fid})

describe('chat window conversation helpers', () => {
  test('keeps guest chat pinned to the default representative until the guest selects another conversation', () => {
    expect(
      resolveActiveConversationFid({
        conversationFid: null,
        conversationItems: [mkConversation('rep-default'), mkConversation('staff-2')],
        conversationSelectionKey: 0,
        guestConversationFid: 'rep-default',
        isGuestFlow: true,
        selectedConversation: {
          fid: undefined,
          requestKey: -1,
        },
      }),
    ).toBe('rep-default')
  })

  test('lets guest chat switch to another staff conversation when selected', () => {
    expect(
      resolveActiveConversationFid({
        conversationFid: null,
        conversationItems: [mkConversation('rep-default'), mkConversation('staff-2')],
        conversationSelectionKey: 0,
        guestConversationFid: 'rep-default',
        isGuestFlow: true,
        selectedConversation: {
          fid: 'staff-2',
          requestKey: 0,
        },
      }),
    ).toBe('staff-2')
  })

  test('falls back to the available guest conversation when the stored representative is not in the list', () => {
    expect(
      resolveActiveConversationFid({
        conversationFid: null,
        conversationItems: [mkConversation('staff-2')],
        conversationSelectionKey: 0,
        guestConversationFid: 'rep-default',
        isGuestFlow: true,
        selectedConversation: {
          fid: undefined,
          requestKey: -1,
        },
      }),
    ).toBe('staff-2')
  })

  test('keeps the guest selector hidden when there is only one conversation', () => {
    expect(
      shouldShowConversationSelector({
        conversationCount: 1,
        isGuestFlow: true,
      }),
    ).toBe(false)
  })

  test('shows the guest selector when multiple staff conversations exist', () => {
    expect(
      shouldShowConversationSelector({
        conversationCount: 2,
        isGuestFlow: true,
      }),
    ).toBe(true)
  })
})
