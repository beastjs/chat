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

})
