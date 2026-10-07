type ConversationItem = {
  fid: string
}

type SelectedConversation = {
  fid: string | null | undefined
  requestKey: number
}

const hasConversation = (
  conversationItems: ConversationItem[],
  fid: string | null | undefined,
) => Boolean(fid && conversationItems.some((conversation) => conversation.fid === fid))

export const resolveActiveConversationFid = ({
  conversationFid,
  conversationItems,
  conversationSelectionKey,
  guestConversationFid,
  isGuestFlow,
  selectedConversation,
}: {
  conversationFid: string | null
  conversationItems: ConversationItem[]
  conversationSelectionKey: number
  guestConversationFid: string | null
  isGuestFlow: boolean
  selectedConversation: SelectedConversation
}) => {
  if (isGuestFlow) {
    if (hasConversation(conversationItems, selectedConversation.fid)) {
      return selectedConversation.fid ?? null
    }

    if (hasConversation(conversationItems, guestConversationFid)) {
      return guestConversationFid
    }

    if (hasConversation(conversationItems, conversationFid)) {
      return conversationFid
    }

    return conversationItems[0]?.fid ?? guestConversationFid ?? conversationFid
  }

  const shouldUseRequestedConversation =
    Boolean(conversationFid) &&
    conversationSelectionKey > selectedConversation.requestKey

  if (shouldUseRequestedConversation) {
    return conversationFid
  }

  return selectedConversation.fid === undefined
    ? conversationFid
    : selectedConversation.fid
}

export const shouldShowConversationSelector = ({
  conversationCount,
  isGuestFlow,
}: {
  conversationCount: number
  isGuestFlow: boolean
}) => !isGuestFlow || conversationCount > 1
