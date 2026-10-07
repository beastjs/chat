import type {Message} from './types'

const groupGap = 5 * 60 * 1000
const dateFormat = new Intl.DateTimeFormat('en-GB', {weekday: 'long', day: 'numeric', month: 'short'})
const timeFormat = new Intl.DateTimeFormat('en-GB', {hour: 'numeric', minute: '2-digit', hour12: true})

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Flat keyed rows preserve scroller anchors while grouping nearby messages. */
export function layoutMessages(messages: readonly Message[]) {
  const dates = messages.map(message => new Date(message.createdAt))
  const startsTimeGroup = dates.map((date, index) => {
    if (!Number.isFinite(date.getTime())) return true
    const previous = dates[index - 1]
    return !previous || !Number.isFinite(previous.getTime()) || !sameDay(previous, date) || date.getTime() - previous.getTime() >= groupGap || date.getTime() < previous.getTime()
  })
  return messages.map((message, index) => {
    const date = dates[index]!
    const validDate = Number.isFinite(date.getTime())
    const dateParts = validDate && startsTimeGroup[index] ? dateFormat.formatToParts(date) : []
    const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find(part => part.type === type)?.value ?? ''
    return {
      message,
      startsRun: startsTimeGroup[index] || messages[index - 1]?.senderId !== message.senderId,
      endsRun: index === messages.length - 1 || startsTimeGroup[index + 1] || messages[index + 1]?.senderId !== message.senderId,
      timestamp: startsTimeGroup[index] && validDate ? `${part('weekday')} ${part('day')} ${part('month')} • ${timeFormat.format(date)}` : null,
    }
  })
}
