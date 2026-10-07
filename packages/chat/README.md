# @beast-chat/chat

Native Beast/Octane chat, extracted from the Rapidfire React module. This source package is an early port, not yet feature-complete. It requires a Beast/Octane build pipeline; it is not directly renderable by React or a script tag.

Octane recommends distributing authored source so the host compiles it with its own matching compiler/runtime: https://octanejs.dev/docs/build-tools.

## Install

```sh
bun add @beast-chat/chat
```

Peer requirements: `octane` and `@octanejs/base-ui` (same Octane 0.8-compatible `0.1.59` line the library is built against). `convex` is an optional peer, needed only for `@beast-chat/chat/convex`. Set the package `repository` field before publishing.

## Import

```btsx
import { Chat } from '@beast-chat/chat'
import type { ChatAdapter, ChatIdentity } from '@beast-chat/chat/core'

props { adapter, identity }: { adapter: ChatAdapter; identity: ChatIdentity }

Chat(adapter={adapter} identity={identity} pageSize={50})
```

Import `@beast-chat/chat/styles.css` once from your app stylesheet or entry. Styles are scoped to `.bc-*`; override `--bc-*` properties on `.bc-chat` for theming. This package supplies no global reset. With Tailwind v4, the stylesheet's `@source "./components"` directive covers the packaged components as long as your build scans the installed package sources.

```css
@import "@beast-chat/chat/styles.css";
```

The registry primitives (`.cn-*`) follow the beast-ui theme, including its `surface` and `positive` tokens alongside the standard ones (`primary`, `secondary`, `muted`, `popover`, `sidebar-border`, …); hosts need all of them for the exact preview look.

`Chat`, `MessageThread`, `Composer`, and `ChatIcon` are exported from the root. Finer entry points exist for `./composer`, `./message-thread`, `./icon`, `./hooks`, `./core`, `./memory`, `./convex`, `./bubble`, `./message-scroller`, `./button`, and `./pulse-like`. Their authored sources are packaged with the library, with no application aliases. The host owns authentication and navigation. Keep adapter/identity objects stable. To switch accounts or adapters, remount Chat with a new key, preventing old conversation state from carrying over.

## Selection

Uncontrolled: `initialConversationFid` sets the initial selection and Chat manages the rest. Controlled (for host routing or deep links): pass `selectedFid` and update it from `onSelectConversation(fid)`. While controlled, taps and the back button only notify the host; the visible thread follows `selectedFid`. The back button reports `onSelectConversation(null)`.

```btsx
Chat(adapter={adapter} identity={identity} selectedFid={selected} onSelectConversation={setSelected} pageSize={50} smoothScroll={false} theme="system")
```

`smoothScroll={false}` skips the lazy Lenis driver and keeps native scrolling; the default `true` enables it per viewport. On phones the chat fills `calc(var(--bc-viewport-height, 100dvh) - var(--bc-mobile-offset, 0px))`; override `--bc-mobile-offset` when a host header sits above the chat.

Message windows use positive integer sizes. Fractional `pageSize`/adapter limits are rounded down; values below one or non-finite values fall back to 50. Standalone `MessageThread` resets its draft and history window when `fid` changes.

## Adapters

`@beast-chat/chat/memory` exports `createMemoryAdapter` for local development. It has no network connection, persistence, or automatic replies. File uploads use local blob URLs; call `adapter.dispose()` after unmounting its consumers to release uploaded attachment URLs.

`@beast-chat/chat/convex` exports `createConvexAdapter`. Pass a host-owned authenticated `ConvexClient` and identity:

```ts
import {createConvexAdapter} from '@beast-chat/chat/convex'

const adapter = createConvexAdapter({client, identity})
```

Set authentication on the client before mounting. `identity.fid` is the Firebase/auth ID; `identity.id` is the corresponding Convex users/guests document ID. They are not interchangeable. Resolve them in the consuming app. The library never reads environment variables, creates a client, or closes your client.

The compatibility adapter targets the existing `rf` message APIs. It retains their auth and schema assumptions. Its queries fetch entire histories and slice on the client; `pageSize` bounds rendering, **not network or database work**. Treat it as small-history only until the bounded timeline/pagination stage lands. The `functions` option can override compatible endpoint names but does not alter their argument or result shapes. A genuinely bounded backend adapter is a remaining port stage.

Convex's framework-independent subscription client: https://docs.convex.dev/api/classes/browser.ConvexClient.

## Attachments

The composer shows an attachment picker when `adapter.upload` is available. Select multiple files, preview images, remove selections, and send with or without text. Files upload when you press Send; upload/send failures retain the draft and selections. Successful uploads are reused on retry. Switching threads or unmounting aborts pending uploads and releases composer preview URLs.

Implement `upload(file, signal)` to return `{storageId, fileName, fileType, fileSize, url}`. The Convex adapter accepts an optional `upload` function in its options; the host owns storage endpoints, authentication, and file validation. Forward the supplied abort signal to network requests. The memory adapter provides local uploads for the playground.

Sent images render as thumbnails; other files show their name and size. Click an attachment to open a fullscreen viewer with Download and Close controls at the top right. Images, video, audio, and PDFs have previews; other formats show a file summary. Escape closes the viewer and restores focus to the attachment. Downloads retain the original file name. Attachment-only messages show file names in the inbox preview.

## Registry primitives and scrolling

`beast-ui.json` installs UI components into `packages/chat/src/components/ui`; imports under `src/components/ui` are compatibility wrappers. Utilities use the package's `cn` dependency. Keep Base UI on the Octane 0.8-compatible `0.1.59` line.

Chat uses `Bubble`/`BubbleContent` and the message scroller's provider, viewport, content, stable-ID items, and return-to-latest button. The scroller preserves position on prepends, follows new messages only while pinned, and batches scroll/observer work with animation frames. Observer and pending-frame cleanup happens on unmount. Native browser scroll anchoring is disabled on the chat viewport so it does not double-adjust prepends.

`trackVisibility` defaults to true on the general scroller provider, retaining the registry visibility hooks. Chat passes false because it does not consume visible-message IDs; ordinary scroll updates therefore avoid the per-message geometry scan. Pin state updates immediately on scroll, while measurements are batched.

Chat enables `smoothScroll` on the provider. Lenis is imported lazily, belongs to that viewport, and runs animation frames only during active scrolling. Wheel input and return-to-latest use Lenis; touch retains native momentum (`syncTouch: false`). Reduced-motion preference skips Lenis and sent-message animations, including when the preference changes while mounted. Observers, motion listeners, and the Lenis instance are released on unmount.

New outgoing messages use the browser View Transition API around an Octane `flushSync` commit, with a 48 px upward glide over 420 ms. Committing the bubble and its final scroll position inside the snapshot callback prevents composer/inbox updates from bypassing the arrival. Initial history, earlier-history loads, receipts, and reactions do not trigger send transitions. Browsers without View Transitions, or with a rejected native capture, use a CSS arrival animation.

`Chat` accepts `theme="light"`, `"dark"`, or `"system"` (default). The playground self-hosts Geist and Geist Mono; the library falls back to system fonts without requiring font downloads. On phones, the inbox and thread occupy separate screens, the composer follows visual-viewport resize, and safe-area insets protect controls. Override `--bc-mobile-offset` when a host header sits above the chat (default `0px`). The composer grows to five lines, retains focus on send, supports IME composition, and uses 16 px input text to avoid mobile focus zoom.

The stylesheet includes a Tailwind 4 `@source` directive for the packaged components so installed sources are scanned in consuming apps. Chat colors and layouts have scoped CSS defaults; the general primitives can also use the consuming app's registry theme.

## Current features

- Conversation list, search of loaded conversations, unread badges
- Responsive full chat and text composer with IME-aware Enter handling
- Message window, explicit earlier-history loading, read receipts, likes
- Consecutive sender groups with centered local date/time labels after five-minute gaps or day changes
- Multiple file selection, image previews, attachment-only sends, upload retries, and download links
- Subscription cleanup, failed-send draft preservation, host callbacks

## Remaining source features

Dock/window, guest bootstrap and account merge, assistant streaming and markdown, voice recording/playback, folders/archive, message deletion, presence, and support communications/hours. No performance benchmark against `rf` has been run yet.

The playground's `SwipeRow` and `@/lib/icons` stay in the demo app. `PulseLike` ships at `@beast-chat/chat/pulse-like` with self-contained icons. Chat supplies its `liked` and `count` from adapter messages; controlled usage keeps the adapter authoritative when a mutation fails.

The working package name is provisional. Nothing has been published.
