import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {Window} from 'happy-dom'
import {compileBeast} from 'beast-tsrx'
import {compile} from 'octane/compiler'
import {readFile} from 'node:fs/promises'
import {createMemoryAdapter} from '../packages/chat/src/adapters/memory'
import type {ChatAdapter, Conversation} from '../packages/chat/src/core'

const browser = new Window({url: 'http://localhost/'})
const originals = new Map<string, PropertyDescriptor | undefined>()
beforeAll(() => {
  const values = browser as unknown as Record<string, unknown>
  for (const name of ['window', 'self', 'document', 'Window', 'Node', 'Element', 'HTMLElement', 'HTMLTemplateElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'Text', 'Comment', 'DocumentFragment', 'MutationObserver', 'NodeFilter']) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value: name === 'window' || name === 'self' ? browser : values[name]})
  }
})
afterAll(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  browser.close()
})
Bun.plugin({name: 'chat-beast-test', setup(build) {
  build.onLoad({filter: /(?:\.btsx$|\.tsrx$|\/hooks\.ts$|@octanejs\/base-ui(?:-utils)?\/src\/.*\.ts$)/}, async ({path}) => {
    const source = await readFile(path, 'utf8')
    const tsrx = path.endsWith('.btsx') ? compileBeast(source, {filename: path}) : path.endsWith('.tsrx') ? source : new Bun.Transpiler({loader: 'ts'}).transformSync(source)
    const result = compile(tsrx, path.replace(/\.btsx$/, '.tsrx'), {mode: 'client', dev: false, hmr: false})
    if (result.diagnostics.length) throw new Error(JSON.stringify(result.diagnostics))
    return {contents: new Bun.Transpiler({loader: 'ts', trimUnusedImports: true}).transformSync(result.code), loader: 'js'}
  })
}})

describe('native Beast chat', () => {
  test('new UI primitives render, toggle likes, and expose swipe actions to keyboard users', async () => {
    const {act, createRoot} = await import('octane')
    const {default: PulseHeart} = await import('../src/components/ui/pulse-like.btsx')
    const {default: SwipeRow} = await import('../src/components/ui/swipe-row.btsx')
    const saved = new Map<string, PropertyDescriptor | undefined>()
    for (const [name, value] of Object.entries({
      requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
      cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
      ResizeObserver: browser.ResizeObserver,
    })) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
      Object.defineProperty(globalThis, name, {configurable: true, value})
    }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    const likes: [boolean, number][] = []
    let commits = 0
    try {
      await act(() => root.render(PulseHeart, {count: 3, onChange: (liked: boolean, count: number) => likes.push([liked, count])}))
      const heart = container.querySelector('button')!
      expect(heart.querySelector('svg path')).not.toBeNull()
      await act(() => heart.dispatchEvent(new browser.MouseEvent('click', {bubbles: true, detail: 0})))
      expect(heart.getAttribute('aria-pressed')).toBe('true')
      expect(likes).toEqual([[true, 4]])
      await act(() => heart.dispatchEvent(new browser.MouseEvent('click', {bubbles: true, detail: 0})))
      expect(likes).toEqual([[true, 4], [false, 3]])
      await act(() => root.render(SwipeRow, {children: 'Swipe me', collapseMs: 0, onCommit: () => { commits++ }}))
      expect(container.textContent).toContain('Swipe me')
      const toggle = container.querySelector('[aria-controls]')!
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      await act(() => toggle.dispatchEvent(new browser.KeyboardEvent('keydown', {bubbles: true, key: 'ArrowLeft'})))
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      await act(() => toggle.dispatchEvent(new browser.KeyboardEvent('keydown', {bubbles: true, key: 'Escape'})))
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      await act(() => toggle.dispatchEvent(new browser.KeyboardEvent('keydown', {bubbles: true, key: 'ArrowLeft'})))
      await act(async () => {
        toggle.dispatchEvent(new browser.KeyboardEvent('keydown', {bubbles: true, key: 'Delete'}))
        await browser.happyDOM.whenAsyncComplete()
      })
      expect(commits).toBe(1)
    } finally {
      await act(() => root.unmount())
      container.remove()
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete (globalThis as Record<string, unknown>)[name]
      }
    }
  })
  test('sending keeps the native View Transition alive through composer and inbox updates', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Chat} = await import('../packages/chat/src/components/Chat.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const adapter = createMemoryAdapter({identity, conversations: [{otherUserId: 'alice', otherUser: {fid: 'alice', name: 'Alice', email: null, photoUrl: null}, lastMessage: {content: 'Hello', createdAt: '2026-10-05T00:00:00Z'}, unreadCount: 0, hasMessages: true}], messages: {alice: [{_id: 'old', senderId: 'alice', receiverId: 'you', content: 'Hello', createdAt: '2026-10-05T00:00:00Z', readAt: '2026-10-05T00:00:00Z'}]}})
    let starts = 0
    let skips = 0
    const doc = browser.document as unknown as Document
    Object.defineProperty(doc, 'startViewTransition', {configurable: true, value: (options: {update: () => unknown} | (() => unknown)) => {
      starts++
      const update = typeof options === 'function' ? options : options.update
      const updateCallbackDone = Promise.resolve().then(update)
      const ready = updateCallbackDone.then(() => {
        const arrival = browser.document.querySelector<HTMLElement>('[data-entering=true]')!
        expect(arrival.textContent).toContain('Glide into the conversation')
        expect(arrival.style.viewTransitionName).toBe('bc-sent-message')
      })
      return {updateCallbackDone, ready, finished: ready.then(() => new Promise(resolve => setTimeout(resolve, 30))), skipTransition: () => { skips++ }}
    }})
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(Chat, {adapter, identity, initialConversationFid: 'alice'}))
      const input = container.querySelector('textarea')!
      input.value = 'Glide into the conversation'
      await act(() => input.dispatchEvent(new browser.Event('input', {bubbles: true})))
      container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true}))
      await new Promise(resolve => setTimeout(resolve, 80))
      await browser.happyDOM.whenAsyncComplete()
      expect(container.textContent).toContain('Glide into the conversation')
      expect(starts).toBeGreaterThan(0)
      expect(skips).toBe(0)
      expect(container.querySelector('[data-entering=true]')).toBeNull()
    } finally {
      await act(() => root.unmount())
      delete (doc as unknown as Record<string, unknown>).startViewTransition
      container.remove()
    }
  })
  test('Lenis stays idle between scrolls and releases its viewport and animation frame', async () => {
    const {createSmoothScroll} = await import('../packages/chat/src/smooth-scroll')
    const pending = new Map<number, FrameRequestCallback>()
    let frameId = 0
    const saved = new Map<string, PropertyDescriptor | undefined>()
    for (const [name, value] of Object.entries({
      requestAnimationFrame: (callback: FrameRequestCallback) => { pending.set(++frameId, callback); return frameId },
      cancelAnimationFrame: (id: number) => pending.delete(id),
      getComputedStyle: browser.getComputedStyle.bind(browser),
    })) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
      Object.defineProperty(globalThis, name, {configurable: true, value})
    }
    const viewport = browser.document.createElement('div')
    const content = browser.document.createElement('div')
    viewport.append(content)
    browser.document.body.append(viewport)
    Object.defineProperties(viewport, {clientHeight: {value: 200}, scrollHeight: {value: 2000}})
    let driver: Awaited<ReturnType<typeof createSmoothScroll>> | undefined
    try {
      driver = await createSmoothScroll(viewport as unknown as HTMLElement, content as unknown as HTMLElement, () => {})
      expect(viewport.classList.contains('lenis')).toBe(true)
      expect(pending.size).toBe(0)
      driver.scrollTo(500, true)
      expect(viewport.scrollTop).toBe(500)
      // Lenis can schedule one-shot native-event bookkeeping, but no idle RAF loop.
      for (let i = 0; i < 4 && pending.size; i++) {
        const callbacks = [...pending.values()]; pending.clear()
        for (const callback of callbacks) callback(i * 16)
      }
      expect(pending.size).toBe(0)
      driver.scrollTo(1200, false)
      expect(pending.size).toBe(1)
      driver.destroy()
      expect(pending.size).toBe(0)
      expect(viewport.classList.contains('lenis')).toBe(false)
      viewport.dispatchEvent(new browser.WheelEvent('wheel', {deltaY: 100, bubbles: true, cancelable: true}))
      expect(pending.size).toBe(0)
    } finally {
      driver?.destroy()
      viewport.remove()
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete (globalThis as Record<string, unknown>)[name]
      }
    }
  })
  test('bounds rendered history, sends text, switches threads, and releases subscriptions', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Chat} = await import('../packages/chat/src/components/Chat.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const conversations: Conversation[] = ['alice', 'bob'].map(fid => ({otherUserId: fid, otherUser: {fid, name: fid, email: `${fid}@example.com`, photoUrl: null}, lastMessage: {content: 'Hello', createdAt: '2026-10-05T00:00:00Z'}, unreadCount: 0, hasMessages: true}))
    const memory = createMemoryAdapter({identity, conversations, messages: {alice: Array.from({length: 60}, (_, i) => ({_id: `m${i}`, senderId: 'you', receiverId: 'alice', content: `Message ${i}`, createdAt: '2026-10-05T00:00:00Z', readAt: null}))}})
    let activeSubscriptions = 0
    const adapter: ChatAdapter = {...memory, subscribeMessages(...args) {
      activeSubscriptions++
      const off = memory.subscribeMessages(...args)
      return () => { activeSubscriptions--; off() }
    }}
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    await act(() => root.render(Chat, {adapter, identity, initialConversationFid: 'alice', pageSize: 50}))
    expect(container.querySelectorAll('.bc-message').length).toBe(50)
    expect(activeSubscriptions).toBe(1)
    const load = container.querySelector('.bc-load')!
    await act(() => load.dispatchEvent(new browser.MouseEvent('click', {bubbles: true})))
    expect(container.querySelectorAll('.bc-message').length).toBe(60)
    expect(activeSubscriptions).toBe(1)
    const input = container.querySelector('textarea')!
    input.value = 'A native Beast message'
    await act(() => input.dispatchEvent(new browser.Event('input', {bubbles: true})))
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true}))
      await Promise.resolve()
    })
    expect(container.textContent).toContain('A native Beast message')
    expect(container.querySelectorAll('[data-entering=true]').length).toBe(1)
    expect(container.querySelector('[data-entering=true]')!.textContent).toContain('A native Beast message')
    expect(input.value).toBe('')
    await act(() => container.querySelectorAll('.bc-conversation')[1]!.dispatchEvent(new browser.MouseEvent('click', {bubbles: true})))
    expect(container.querySelectorAll('.bc-message').length).toBe(0)
    expect(activeSubscriptions).toBe(1)
    await act(() => root.unmount())
    expect(activeSubscriptions).toBe(0)
    container.remove()
  })
  test('preserves reading position on prepend, follows pinned replies, and skips visibility scans', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Chat} = await import('../packages/chat/src/components/Chat.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const memory = createMemoryAdapter({identity, conversations: [{otherUserId: 'alice', otherUser: {fid: 'alice', name: 'Alice', email: 'alice@example.com', photoUrl: null}, lastMessage: {content: 'Hello', createdAt: '2026-10-05T00:00:00Z'}, unreadCount: 0, hasMessages: true}], messages: {alice: Array.from({length: 60}, (_, i) => ({_id: `scroll-${i}`, senderId: 'you', receiverId: 'alice', content: `Message ${i}`, createdAt: '2026-10-05T00:00:00Z', readAt: null}))}})
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(Chat, {adapter: memory, identity, initialConversationFid: 'alice', pageSize: 50}))
      await browser.happyDOM.whenAsyncComplete()
      const viewport = container.querySelector('.bc-messages')!
      let top = 100
      let measurements = 0
      Object.defineProperties(viewport, {
        clientHeight: {configurable: true, get: () => 200},
        scrollHeight: {configurable: true, get: () => container.querySelectorAll('[data-message-id]').length * 100},
        scrollTop: {configurable: true, get: () => top, set: (value: number) => { top = Math.max(0, Math.min(value, viewport.scrollHeight - 200)) }},
        getBoundingClientRect: {configurable: true, value: () => { measurements++; return {top: 0, bottom: 200} }},
      })
      viewport.append(browser.document.createComment('geometry initialized'))
      await act(async () => { await browser.happyDOM.whenAsyncComplete() })
      top = 100
      await act(() => viewport.dispatchEvent(new browser.Event('scroll')))
      expect(container.querySelector('[data-slot=message-scroller-button]')!.getAttribute('data-active')).toBe('true')
      await act(async () => {
        container.querySelector('.bc-load')!.dispatchEvent(new browser.MouseEvent('click', {bubbles: true}))
        await browser.happyDOM.whenAsyncComplete()
      })
      expect(top).toBe(1100)
      await act(async () => {
        await memory.sendMessage('alice', 'A reply while reading')
        await browser.happyDOM.whenAsyncComplete()
      })
      expect(top).toBe(1100)
      await act(async () => { container.querySelector('[data-slot=message-scroller-button]')!.dispatchEvent(new browser.MouseEvent('click', {bubbles: true})); await browser.happyDOM.whenAsyncComplete() })
      expect(top).toBe(viewport.scrollHeight - 200)
      viewport.scrollTop = viewport.scrollHeight - 200
      await act(() => viewport.dispatchEvent(new browser.Event('scroll')))
      await act(async () => {
        await memory.sendMessage('alice', 'A reply at the bottom')
        await browser.happyDOM.whenAsyncComplete()
      })
      expect(top).toBe(viewport.scrollHeight - 200)
      expect(measurements).toBe(0)
      expect(container.querySelectorAll('[data-slot=bubble]').length).toBe(62)
      const pending = new Map<number, FrameRequestCallback>()
      let frameId = 0
      const originalRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
      const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame')
      Object.defineProperty(globalThis, 'requestAnimationFrame', {configurable: true, value: (callback: FrameRequestCallback) => { pending.set(++frameId, callback); return frameId }})
      Object.defineProperty(globalThis, 'cancelAnimationFrame', {configurable: true, value: (id: number) => pending.delete(id)})
      try {
        await act(() => { for (let i = 0; i < 3; i++) viewport.dispatchEvent(new browser.Event('scroll')) })
        expect(pending.size).toBe(1)
        await act(() => { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(0) })
        expect(pending.size).toBe(0)
        await act(() => viewport.dispatchEvent(new browser.Event('scroll')))
        expect(pending.size).toBe(1)
        const scrollFrame = [...pending.keys()][0]!
        await act(() => root.unmount())
        expect(pending.has(scrollFrame)).toBe(false)
      } finally {
        if (originalRequest) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRequest)
        else delete (globalThis as Record<string, unknown>).requestAnimationFrame
        if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel)
        else delete (globalThis as Record<string, unknown>).cancelAnimationFrame
      }
    } finally {
      await act(() => root.unmount())
      container.remove()
    }
  })
  test('controlled selectedFid lets the host drive thread selection', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Chat} = await import('../packages/chat/src/components/Chat.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const conversations: Conversation[] = ['alice', 'bob'].map(fid => ({otherUserId: fid, otherUser: {fid, name: fid, email: `${fid}@example.com`, photoUrl: null}, lastMessage: {content: 'Hello', createdAt: '2026-10-05T00:00:00Z'}, unreadCount: 0, hasMessages: true}))
    const adapter = createMemoryAdapter({identity, conversations, messages: {}})
    const seen: Array<string | null> = []
    const onSelectConversation = (fid: string | null) => { seen.push(fid) }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(Chat, {adapter, identity, selectedFid: 'alice', onSelectConversation}))
      expect(container.querySelector('.bc-thread-header')!.textContent).toContain('alice')
      await act(() => container.querySelectorAll('.bc-conversation')[1]!.dispatchEvent(new browser.MouseEvent('click', {bubbles: true})))
      expect(seen).toEqual(['bob'])
      expect(container.querySelector('.bc-thread-header')!.textContent).toContain('alice')
      await act(() => root.render(Chat, {adapter, identity, selectedFid: 'bob', onSelectConversation}))
      expect(container.querySelector('.bc-thread-header')!.textContent).toContain('bob')
      await act(() => container.querySelector('.bc-back')!.dispatchEvent(new browser.MouseEvent('click', {bubbles: true})))
      expect(seen).toEqual(['bob', null])
      expect(container.querySelector('.bc-thread-header')!.textContent).toContain('bob')
      await act(() => root.render(Chat, {adapter, identity, selectedFid: null, onSelectConversation}))
      expect(container.querySelector('.bc-thread-header')).toBeNull()
    } finally {
      await act(() => root.unmount())
      container.remove()
    }
  })
  test('smoothScroll={false} keeps native scrolling and still sends', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Chat} = await import('../packages/chat/src/components/Chat.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const adapter = createMemoryAdapter({identity, conversations: [{otherUserId: 'alice', otherUser: {fid: 'alice', name: 'Alice', email: 'alice@example.com', photoUrl: null}, lastMessage: {content: 'Hello', createdAt: '2026-10-05T00:00:00Z'}, unreadCount: 0, hasMessages: true}], messages: {}})
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(Chat, {adapter, identity, initialConversationFid: 'alice', smoothScroll: false}))
      await browser.happyDOM.whenAsyncComplete()
      const input = container.querySelector('textarea')!
      input.value = 'Native scroll send'
      await act(() => input.dispatchEvent(new browser.Event('input', {bubbles: true})))
      await act(async () => {
        container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true}))
        await browser.happyDOM.whenAsyncComplete()
      })
      expect(container.textContent).toContain('Native scroll send')
      expect(container.querySelector('.bc-messages')!.classList.contains('lenis')).toBe(false)
    } finally {
      await act(() => root.unmount())
      container.remove()
    }
  })
  test('reactions reflect adapter likes and retain their state after a rejected mutation', async () => {
    const {act, createRoot} = await import('octane')
    const {default: MessageThread} = await import('../packages/chat/src/components/MessageThread.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const memory = createMemoryAdapter({identity, conversations: [], messages: {alice: [{_id: 'liked', senderId: 'alice', receiverId: 'you', content: 'Liked message', createdAt: '2026-10-05T00:00:00Z', readAt: '2026-10-05T00:00:00Z', likes: [{userId: 'you', likedAt: ''}, {userId: 'alice', likedAt: ''}]}, {_id: 'own', senderId: 'you', receiverId: 'alice', content: 'Own message', createdAt: '2026-10-05T00:01:00Z', readAt: null, likes: [{userId: 'alice', likedAt: ''}]}]}})
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(MessageThread, {adapter: memory, identity, fid: 'alice', smoothScroll: false}))
      expect(container.querySelector('.bc-own button[aria-pressed]')).toBeNull()
      expect(container.querySelectorAll('.bc-other button[aria-pressed]').length).toBe(1)
      const reaction = () => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!
      expect(reaction().getAttribute('aria-pressed')).toBe('true')
      expect(reaction().textContent).toContain('Like message, 2')
      await act(async () => { reaction().click(); await Promise.resolve() })
      expect(reaction().getAttribute('aria-pressed')).toBe('false')
      expect(reaction().textContent).toBe('Like message')
      const failing = {...memory, toggleLike: async () => { throw new Error('Reaction failed') }}
      await act(() => root.render(MessageThread, {adapter: failing, identity, fid: 'alice', smoothScroll: false}))
      await act(async () => { reaction().click(); await Promise.resolve() })
      expect(reaction().getAttribute('aria-pressed')).toBe('false')
      expect(reaction().textContent).toBe('Like message')
      expect(container.querySelector('[role=alert]')?.textContent).toBe('Reaction failed')
    } finally { await act(() => root.unmount()); container.remove() }
  })
  test('standalone threads reset drafts and history windows when the participant changes', async () => {
    const {act, createRoot} = await import('octane')
    const {default: MessageThread} = await import('../packages/chat/src/components/MessageThread.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const messages = Array.from({length: 4}, (_, i) => ({_id: `m${i}`, senderId: 'you', receiverId: 'alice', content: `Message ${i}`, createdAt: '', readAt: null}))
    const memory = createMemoryAdapter({identity, conversations: [], messages: {alice: messages, bob: messages}})
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(MessageThread, {adapter: memory, identity, fid: 'alice', pageSize: 2, smoothScroll: false}))
      await act(() => container.querySelector<HTMLButtonElement>('.bc-load')!.click())
      const input = container.querySelector('textarea')!
      input.value = 'Private draft for Alice'
      await act(() => input.dispatchEvent(new browser.Event('input', {bubbles: true})))
      expect(container.querySelectorAll('.bc-message').length).toBe(4)
      await act(() => root.render(MessageThread, {adapter: memory, identity, fid: 'bob', pageSize: 2, smoothScroll: false}))
      expect(container.querySelectorAll('.bc-message').length).toBe(2)
      expect(container.querySelector('textarea')!.value).toBe('')
    } finally { await act(() => root.unmount()); container.remove() }
  })
  test('compatibility wrappers resolve public exports and share the message scroller provider', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Bubble} = await import('../src/components/ui/chat-bubble.btsx')
    const {default: Button} = await import('../src/components/ui/chat-button.btsx')
    const {default: Scroller} = await import('../src/components/ui/scroller.btsx')
    const {MessageScrollerProvider} = await import('../src/components/ui/message-scroller.btsx')
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(Bubble, {children: 'Bubble'}))
      expect(container.textContent).toBe('Bubble')
      await act(() => root.render(Button, {children: 'Button'}))
      expect(container.querySelector('button')!.textContent).toBe('Button')
      await act(() => root.render(Scroller, {children: 'Scroller'}))
      expect(container.textContent).toBe('Scroller')
      await act(() => root.render(MessageScrollerProvider, {children: 'Provider'}))
      expect(container.textContent).toBe('Provider')
    } finally { await act(() => root.unmount()); container.remove() }
  })

  test('selects and removes previews, sends attachment-only messages, and releases local URLs', async () => {
    const {act, createRoot} = await import('octane')
    const {default: MessageThread} = await import('../packages/chat/src/components/MessageThread.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const memory = createMemoryAdapter({identity, conversations: [{otherUserId: 'alice', otherUser: {fid: 'alice', name: 'Alice', email: '', photoUrl: null}, lastMessage: {content: '', createdAt: ''}, unreadCount: 0, hasMessages: false}]})
    const createUrl = URL.createObjectURL
    const revokeUrl = URL.revokeObjectURL
    const revoked: string[] = []
    let sequence = 0
    URL.createObjectURL = () => `blob:attachment-${++sequence}`
    URL.revokeObjectURL = url => { revoked.push(url) }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(MessageThread, {adapter: memory, identity, fid: 'alice', smoothScroll: false}))
      const picker = container.querySelector('input[type=file]')!
      Object.defineProperty(picker, 'files', {configurable: true, value: [new File(['image'], 'photo.png', {type: 'image/png'}), new File(['document'], 'notes.txt', {type: 'text/plain'})]})
      await act(() => picker.dispatchEvent(new browser.Event('change', {bubbles: true})))
      expect(container.querySelector('.bc-file-preview')!.getAttribute('src')).toBe('blob:attachment-1')
      expect(container.querySelectorAll('.bc-pending-file').length).toBe(2)
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remove photo.png"]')!.click())
      expect(revoked).toEqual(['blob:attachment-1'])
      expect(container.querySelector<HTMLButtonElement>('.bc-send')!.disabled).toBe(false)
      await act(async () => { container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true})); await Promise.resolve(); await Promise.resolve() })
      expect(container.querySelectorAll('.bc-pending-file').length).toBe(0)
      expect(container.querySelector('.bc-attachment-file')!.textContent).toContain('notes.txt')
      expect(container.querySelector('.bc-attachment-file')!.getAttribute('aria-label')).toBe('View notes.txt')
      expect(container.querySelector('.bc-message-text')).toBeNull()
      expect(container.querySelector<HTMLButtonElement>('.bc-send')!.disabled).toBe(true)
    } finally {
      await act(() => root.unmount()); container.remove(); memory.dispose()
      URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl
    }
    expect(revoked).toEqual(['blob:attachment-1', 'blob:attachment-2'])
  })
  test('previews and sends audio-only attachments, preserves viewer access, and releases previews', async () => {
    const {act, createRoot} = await import('octane')
    const {default: MessageThread} = await import('../packages/chat/src/components/MessageThread.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const memory = createMemoryAdapter({identity, conversations: [{otherUserId: 'alice', otherUser: {fid: 'alice', name: 'Alice', email: null, photoUrl: null}, lastMessage: {content: '', createdAt: ''}, unreadCount: 0, hasMessages: false}]})
    const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL
    const revoked: string[] = []
    let sequence = 0
    URL.createObjectURL = () => `blob:audio-${++sequence}`
    URL.revokeObjectURL = url => { revoked.push(url) }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(MessageThread, {adapter: memory, identity, fid: 'alice', smoothScroll: false}))
      const picker = container.querySelector('input[type=file]')!
      Object.defineProperty(picker, 'files', {configurable: true, value: [new File(['audio'], 'song.mp3', {type: 'audio/mpeg'}), new File(['audio'], 'memo.m4a')]})
      await act(() => picker.dispatchEvent(new browser.Event('change', {bubbles: true})))
      expect(container.querySelectorAll('.bc-pending-file audio').length).toBe(2)
      expect(container.querySelector('audio')!.getAttribute('preload')).toBe('metadata')
      expect(container.querySelector('.bc-audio-toggle')).not.toBeNull()
      expect(container.querySelector('.bc-pending-file .bc-file-info')).toBeNull()
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remove song.mp3"]')!.click())
      expect(revoked).toEqual(['blob:audio-1'])
      await act(async () => {
        container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true}))
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })
      expect(container.querySelectorAll('.bc-pending-file').length).toBe(0)
      const audio = container.querySelector('.bc-attachment-audio audio')!
      expect(audio.getAttribute('src')).toBe('blob:audio-3')
      expect(audio.getAttribute('aria-label')).toBe('Play Voice message')
      expect(container.querySelector('.bc-attachment-audio')!.textContent).not.toContain('memo.m4a')
      expect(audio.closest('button')).toBeNull()
      expect(revoked).toEqual(['blob:audio-1', 'blob:audio-2'])
      await act(() => audio.dispatchEvent(new browser.Event('error')))
      expect(container.querySelector('.bc-audio-error')!.textContent).toContain('unavailable')
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="View memo.m4a"]')!.click())
      expect(container.querySelector('.bc-viewer-audio')!.getAttribute('src')).toBe('blob:audio-3')
      expect(container.querySelector('[aria-label="Download attachment"]')).not.toBeNull()
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close attachment viewer"]')!.click())
      await act(() => picker.dispatchEvent(new browser.Event('change', {bubbles: true})))
      await act(() => root.unmount())
      expect(revoked).toEqual(['blob:audio-1', 'blob:audio-2', 'blob:audio-4', 'blob:audio-5'])
    } finally {
      await act(() => root.unmount()); container.remove(); memory.dispose()
      URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl
    }
    expect(revoked).toContain('blob:audio-3')
  })
  test('compact audio controls play, seek, rewind, and stop playback on unmount', async () => {
    const {act, createRoot} = await import('octane')
    const {default: AudioPlayer} = await import('../packages/chat/src/components/AudioPlayer.btsx')
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    let pauses = 0
    try {
      await act(() => root.render(AudioPlayer, {src: 'blob:voice', name: 'Voice message'}))
      const audio = container.querySelector('audio')!
      let paused = true
      Object.defineProperties(audio, {
        duration: {value: 65, configurable: true},
        paused: {get: () => paused, configurable: true},
        play: {value: async () => { paused = false; audio.dispatchEvent(new browser.Event('play')) }},
        pause: {value: () => { paused = true; pauses++; audio.dispatchEvent(new browser.Event('pause')) }},
      })
      await act(() => audio.dispatchEvent(new browser.Event('loadedmetadata')))
      const seek = container.querySelector('input[type=range]')!
      expect(seek.disabled).toBe(false)
      expect(container.querySelector('.bc-audio-times')!.textContent).toContain('1:05')
      await act(async () => { container.querySelector<HTMLButtonElement>('.bc-audio-toggle')!.click(); await Promise.resolve() })
      expect(container.querySelector('.bc-audio-toggle')!.getAttribute('aria-label')).toBe('Pause Voice message')
      seek.value = '30'
      await act(() => seek.dispatchEvent(new browser.Event('input', {bubbles: true})))
      expect(audio.currentTime).toBe(30)
      expect(seek.getAttribute('aria-valuetext')).toBe('0:30 of 1:05')
      await act(() => container.querySelector<HTMLButtonElement>('.bc-audio-toggle')!.click())
      expect(pauses).toBe(1)
      await act(() => audio.dispatchEvent(new browser.Event('ended')))
      expect(audio.currentTime).toBe(0)
      expect(seek.value).toBe('0')
      await act(() => root.unmount())
      expect(pauses).toBe(2)
    } finally { await act(() => root.unmount()); container.remove() }
  })
  test('plus options record, cancel, and send microphone audio with cleanup', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Composer} = await import('../packages/chat/src/components/Composer.btsx')
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const recorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
    const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL
    let stoppedTracks = 0
    let rejectPermission = false
    let latePermission: ((stream: unknown) => void) | undefined
    let delayPermission = false
    const stream = {getTracks: () => [{stop: () => { stoppedTracks++ }}]}
    class Recorder {
      static isTypeSupported(type: string) { return type === 'audio/mp4' }
      mimeType: string
      state = 'inactive'
      ondataavailable: ((event: {data: Blob}) => void) | null = null
      onstop: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(_stream: unknown, options: {mimeType: string}) { this.mimeType = options.mimeType }
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        queueMicrotask(() => { this.ondataavailable?.({data: new Blob(['voice'], {type: this.mimeType})}); this.onstop?.() })
      }
    }
    Object.defineProperty(globalThis, 'MediaRecorder', {configurable: true, value: Recorder})
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {mediaDevices: {getUserMedia: async () => {
      if (rejectPermission) throw new DOMException('Denied', 'NotAllowedError')
      if (delayPermission) return new Promise(resolve => { latePermission = resolve })
      return stream
    }}}})
    URL.createObjectURL = () => 'blob:recorded-voice'
    const revoked: string[] = []
    URL.revokeObjectURL = url => { revoked.push(url) }
    const uploaded: File[] = []
    const sent: unknown[][] = []
    const adapter: ChatAdapter = {
      subscribeConversations: () => () => {}, subscribeMessages: () => () => {},
      upload: async file => { uploaded.push(file); return {storageId: 'voice', fileName: file.name, fileType: file.type, fileSize: file.size, url: 'blob:uploaded-voice'} },
      sendMessage: async (...args) => { sent.push(args) },
    }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    const record = async () => {
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Add attachments"]')!.click())
      expect(container.querySelector('.bc-attachment-options')!.textContent).toContain('Photos and videos')
      await act(async () => { [...container.querySelectorAll<HTMLButtonElement>('.bc-attachment-options button')].find(button => button.textContent!.includes('Record audio'))!.click(); for (let i = 0; i < 5; i++) await Promise.resolve() })
    }
    try {
      await act(() => root.render(Composer, {adapter, fid: 'alice'}))
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Add attachments"]')!.click())
      expect(container.querySelector('[aria-expanded=true]')).not.toBeNull()
      await act(() => container.querySelector('.bc-attachment-options button')!.dispatchEvent(new browser.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})))
      expect(container.querySelector('.bc-attachment-options')).toBeNull()
      await record()
      expect(container.querySelector('[role=status]')!.textContent).toBe('Recording 0:00')
      expect(container.querySelector<HTMLButtonElement>('.bc-send')!.disabled).toBe(true)
      await act(async () => { container.querySelector<HTMLButtonElement>('.bc-recording-stop')!.click(); for (let i = 0; i < 5; i++) await Promise.resolve() })
      expect(stoppedTracks).toBeGreaterThanOrEqual(1)
      expect(container.querySelector('.bc-pending-file audio')).not.toBeNull()
      expect(container.querySelector('.bc-pending-file')!.textContent).not.toContain('voice-message-')
      expect(container.querySelector('.bc-pending-file .bc-file-info')).toBeNull()
      expect(sent.length).toBe(0)
      await act(async () => { container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true})); for (let i = 0; i < 5; i++) await Promise.resolve() })
      expect(uploaded[0]!.type).toBe('audio/mp4')
      expect(uploaded[0]!.name.endsWith('.m4a')).toBe(true)
      expect(sent[0]![1]).toBe('')
      expect(revoked).toEqual(['blob:recorded-voice'])
      await record()
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Cancel recording"]')!.click())
      expect(container.querySelector('.bc-pending-file')).toBeNull()
      rejectPermission = true
      await record()
      expect(container.querySelector('[role=alert]')!.textContent).toContain('Microphone access was denied')
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Cancel recording"]')!.click())
      rejectPermission = false; delayPermission = true
      await record()
      await act(() => root.unmount())
      const stoppedBefore = stoppedTracks
      latePermission!(stream)
      await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
      expect(stoppedTracks).toBe(stoppedBefore + 1)
      expect(sent.length).toBe(1)
    } finally {
      await act(() => root.unmount()); container.remove()
      URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl
      if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
      else delete (globalThis as Record<string, unknown>).navigator
      if (recorderDescriptor) Object.defineProperty(globalThis, 'MediaRecorder', recorderDescriptor)
      else delete (globalThis as Record<string, unknown>).MediaRecorder
    }
  })
  test('retains drafts and files through upload/send failures without uploading successful files again', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Composer} = await import('../packages/chat/src/components/Composer.btsx')
    const uploads: string[] = []
    const sends: unknown[][] = []
    let failUpload = true
    let failSend = true
    const adapter: ChatAdapter = {
      subscribeConversations: () => () => {}, subscribeMessages: () => () => {},
      upload: async file => {
        uploads.push(file.name)
        if (file.name === 'second.txt' && failUpload) { failUpload = false; throw new Error('Upload failed') }
        return {storageId: file.name, fileName: file.name, fileType: file.type, fileSize: file.size, url: null}
      },
      sendMessage: async (...args) => { sends.push(args); if (failSend) { failSend = false; throw new Error('Send failed') } },
    }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    const submit = async () => { await act(async () => { container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true})); for (let i = 0; i < 5; i++) await Promise.resolve() }) }
    try {
      await act(() => root.render(Composer, {adapter, fid: 'alice'}))
      const picker = container.querySelector('input[type=file]')!
      Object.defineProperty(picker, 'files', {configurable: true, value: [new File(['one'], 'first.txt'), new File(['two'], 'second.txt')]})
      await act(() => picker.dispatchEvent(new browser.Event('change', {bubbles: true})))
      const input = container.querySelector('textarea')!
      input.value = 'Keep my draft'
      await act(() => input.dispatchEvent(new browser.Event('input', {bubbles: true})))
      await submit()
      expect(container.querySelector('[role=alert]')!.textContent).toBe('Upload failed')
      expect(sends.length).toBe(0)
      expect(input.value).toBe('Keep my draft')
      await submit()
      expect(container.querySelector('[role=alert]')!.textContent).toBe('Send failed')
      expect(container.querySelectorAll('.bc-pending-file').length).toBe(2)
      expect(input.value).toBe('Keep my draft')
      await submit()
      expect(uploads).toEqual(['first.txt', 'second.txt', 'second.txt'])
      expect(sends.length).toBe(2)
      expect((sends[1]![2] as unknown[]).length).toBe(2)
      expect(input.value).toBe('')
      expect(container.querySelectorAll('.bc-pending-file').length).toBe(0)
    } finally { await act(() => root.unmount()); container.remove() }
  })
  test('aborts an in-flight upload and releases previews when the composer unmounts', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Composer} = await import('../packages/chat/src/components/Composer.btsx')
    let signal: AbortSignal | undefined
    let finish!: (attachment: import('../packages/chat/src/core/types').Attachment) => void
    let sends = 0
    const adapter: ChatAdapter = {
      subscribeConversations: () => () => {}, subscribeMessages: () => () => {},
      upload: (_file, uploadSignal) => { signal = uploadSignal; return new Promise(resolve => { finish = resolve }) },
      sendMessage: async () => { sends++ },
    }
    const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL
    const revoked: string[] = []
    URL.createObjectURL = () => 'blob:pending-preview'
    URL.revokeObjectURL = url => { revoked.push(url) }
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    try {
      await act(() => root.render(Composer, {adapter, fid: 'alice'}))
      const picker = container.querySelector('input[type=file]')!
      Object.defineProperty(picker, 'files', {configurable: true, value: [new File(['image'], 'photo.png', {type: 'image/png'})]})
      await act(() => picker.dispatchEvent(new browser.Event('change', {bubbles: true})))
      await act(() => container.querySelector('form')!.dispatchEvent(new browser.Event('submit', {bubbles: true, cancelable: true})))
      expect(container.querySelector('[role=status]')!.textContent).toBe('Uploading…')
      expect(container.querySelector<HTMLButtonElement>('.bc-send')!.disabled).toBe(true)
      await act(() => root.unmount())
      expect(signal!.aborted).toBe(true)
      expect(revoked).toEqual(['blob:pending-preview'])
      finish({storageId: 'uploaded', fileName: 'photo.png', fileSize: 5, fileType: 'image/png', url: null})
      await Promise.resolve()
      expect(sends).toBe(0)
    } finally {
      await act(() => root.unmount()); container.remove()
      URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl
    }
  })

  test('attachment buttons open modal previews, close with Escape, and restore focus and page scrolling', async () => {
    const {act, createRoot} = await import('octane')
    const {default: MessageThread} = await import('../packages/chat/src/components/MessageThread.btsx')
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const memory = createMemoryAdapter({identity, conversations: [], messages: {alice: [{_id: 'files', senderId: 'you', receiverId: 'alice', content: '', createdAt: '', readAt: null, attachments: [
      {storageId: 'image', fileName: 'photo.png', fileType: 'image/png', fileSize: 100, url: 'https://example.com/photo.png'},
      {storageId: 'notes', fileName: 'notes.txt', fileType: 'text/plain', fileSize: 200, url: 'https://example.com/notes.txt'},
    ]}]}})
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    const overflow = browser.document.body.style.overflow
    browser.document.body.style.overflow = 'auto'
    try {
      await act(() => root.render(MessageThread, {adapter: memory, identity, fid: 'alice', smoothScroll: false}))
      const imageButton = container.querySelector<HTMLButtonElement>('[aria-label="View photo.png"]')!
      imageButton.focus()
      await act(() => imageButton.click())
      const dialog = container.querySelector('dialog')!
      expect(dialog.open).toBe(true)
      expect(dialog.getAttribute('aria-label')).toBe('Attachment viewer: photo.png')
      expect(dialog.querySelector('.bc-viewer-image')!.getAttribute('src')).toBe('https://example.com/photo.png')
      expect([...dialog.querySelectorAll('.bc-viewer-actions button')].map(button => button.getAttribute('aria-label'))).toEqual(['Download attachment', 'Close attachment viewer'])
      expect(browser.document.body.style.overflow).toBe('hidden')
      const cancel = new browser.Event('cancel', {cancelable: true})
      await act(() => dialog.dispatchEvent(cancel))
      expect(cancel.defaultPrevented).toBe(true)
      expect(container.querySelector('dialog')).toBeNull()
      expect(browser.document.activeElement === imageButton).toBe(true)
      expect(browser.document.body.style.overflow).toBe('auto')
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="View notes.txt"]')!.click())
      expect(container.querySelector('.bc-viewer-fallback')!.textContent).toContain('Preview is not available')
      await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close attachment viewer"]')!.click())
      expect(container.querySelector('dialog')).toBeNull()
    } finally { await act(() => root.unmount()); container.remove(); browser.document.body.style.overflow = overflow }
  })
  test('viewer downloads use the original filename, handle failed requests, and release temporary URLs', async () => {
    const {act, createRoot} = await import('octane')
    const {default: Viewer} = await import('../packages/chat/src/components/AttachmentViewer.btsx')
    const originalFetch = globalThis.fetch
    const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL
    const revoked: string[] = []
    const saved: {url: string; name: string}[] = []
    let succeed = false
    let signal: AbortSignal | undefined
    globalThis.fetch = (async (_input: unknown, options: RequestInit) => {
      signal = options.signal as AbortSignal
      return new Response(succeed ? 'File bytes' : 'Unavailable', {status: succeed ? 200 : 503})
    }) as typeof fetch
    URL.createObjectURL = () => 'blob:download-fixture'
    URL.revokeObjectURL = url => { revoked.push(url) }
    const captureDownload = (event: import('happy-dom').Event) => {
      const link = event.target as import('happy-dom').HTMLAnchorElement
      if (link.tagName === 'A' && link.download) { event.preventDefault(); expect(link.closest('dialog')).not.toBeNull(); saved.push({url: link.href, name: link.download}) }
    }
    browser.document.addEventListener('click', captureDownload)
    const container = browser.document.createElement('div')
    browser.document.body.append(container)
    const root = createRoot(container as unknown as HTMLElement)
    const clickDownload = async () => { await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Download attachment"]')!.click(); for (let i = 0; i < 8; i++) await Promise.resolve() }) }
    try {
      await act(() => root.render(Viewer, {attachment: {storageId: 'file', fileName: 'original-name.txt', fileType: 'text/plain', fileSize: 10, url: 'https://storage.example/file'}, onClose: () => {}}))
      await clickDownload()
      expect(container.querySelector('[role=alert]')!.textContent).toContain('Could not download')
      expect(saved.length).toBe(0)
      succeed = true
      await clickDownload()
      expect(container.querySelector('[role=alert]')).toBeNull()
      expect(saved).toEqual([{url: 'blob:download-fixture', name: 'original-name.txt'}])
      await act(() => root.unmount())
      expect(signal!.aborted).toBe(true)
      expect(revoked).toEqual(['blob:download-fixture'])
    } finally {
      await act(() => root.unmount()); container.remove()
      browser.document.removeEventListener('click', captureDownload)
      globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl
    }
  })

})
