import {describe, expect, test} from 'bun:test'
import {readdir, readFile} from 'node:fs/promises'
import {dirname, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createMemoryAdapter} from '../packages/chat/src/adapters/memory'
import {createConvexAdapter} from '../packages/chat/src/adapters/convex'
import type {ConvexClient} from 'convex/browser'
import type {Message, MessageWindow} from '../packages/chat/src/core'

const packageRoot = fileURLToPath(new URL('../packages/chat/', import.meta.url))
describe('published chat package', () => {
  test('every source import stays inside the package or names a declared dependency', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
    const dependencies = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.peerDependencies)])
    for (const entry of Object.values(manifest.exports) as string[]) {
      expect(await Bun.file(resolve(packageRoot, entry)).exists()).toBe(true)
    }
    const files = await readdir(resolve(packageRoot, 'src'), {recursive: true})
    for (const file of files.filter(file => /\.(ts|btsx)$/.test(file))) {
      const absolute = resolve(packageRoot, 'src', file)
      const source = await readFile(absolute, 'utf8')
      for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(absolute), specifier)
          expect(target.startsWith(packageRoot.endsWith(sep) ? packageRoot : packageRoot + sep)).toBe(true)
          const candidates = [target, target + '.ts', resolve(target, 'index.ts')]
          expect((await Promise.all(candidates.map(path => Bun.file(path).exists()))).some(Boolean)).toBe(true)
        } else {
          const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
          expect(dependencies.has(name)).toBe(true)
        }
      }
    }
  })
  test('invalid limits cannot accidentally return an entire memory or Convex history', () => {
    const messages: Message[] = Array.from({length: 80}, (_, i) => ({_id: `m${i}`, senderId: 'you', receiverId: 'alice', content: '', createdAt: '', readAt: null}))
    const identity = {id: 'you', fid: 'you', name: 'You'}
    const memory = createMemoryAdapter({identity, conversations: [], messages: {alice: messages}})
    const client = {onUpdate: (_query: unknown, _args: unknown, callback: (messages: Message[]) => void) => { callback(messages); return () => {} }} as unknown as ConvexClient
    const convex = createConvexAdapter({identity, client})
    for (const adapter of [memory, convex]) {
      for (const [limit, size] of [[0, 50], [-1, 50], [NaN, 50], [Infinity, 50], [2.9, 2], [1, 1]]) {
        let value: MessageWindow | undefined
        const off = adapter.subscribeMessages('alice', limit!, result => { value = result }, error => { throw error })
        expect(value!.messages.length).toBe(size!)
        expect(value!.hasMore).toBe(true)
        expect(value!.messages.at(-1)!._id).toBe('m79')
        off()
      }
    }
  })
})
