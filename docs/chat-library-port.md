# Chat library port

Source: `~/Code/rf`. Goal: an importable chat library, with this app as its development playground.

## First extraction

`packages/chat/src/core` contains framework-independent types and the existing dock conversation-selection rules. IDs are strings rather than generated Convex types; the source field names remain intact to make adapters straightforward. Auth `fid` and database participant IDs remain distinct. These files have no UI, backend, or browser dependencies.

The UI runtime is Beast/Octane. `packages/chat` is an importable workspace source package, with separate core, memory, Convex, and CSS entry points. The app is its local playground. The first native slice covers conversations, text messages, receipts, reactions, attachment links, and a rendered message window. It is not the complete source module.

## Intended scope

| Surface | Source |
| --- | --- |
| Conversation browser, search, folders, full chat | `app/account/chat/content.tsx` and `_components/conversation-*` |
| Message groups, bubbles, receipts, likes, attachments | `app/account/chat/_components/message-*` |
| Composer, uploads, voice recording/playback | `message-input.tsx`, `use-audio-recorder.ts`, `audio-message-player.tsx` |
| Assistant messages, markdown, streaming | `app/account/chat/_components/assistant/` |
| Floating dock and window | `components/main/chat-dock.tsx`, `chat-window.tsx` |
| Guest session and sign-in handoff | `ctx/guest-chat.tsx` |

The admin screen supplies application-specific user/staff/guest management. Its reusable chat window is covered above; admin tables, analytics, and commerce features need a separate scope decision.

## Integration boundaries

- Identity: consuming app supplies the signed-in or guest identity and sign-in action. Avoid importing `ctx/auth`.
- Messaging: an adapter supplies subscriptions and operations for conversations, messages, read receipts, likes, archives, and folders. Convex belongs in an optional adapter.
- Uploads: adapter supplies upload behavior and attachment metadata. Avoid hardcoded Convex endpoints.
- Assistant: configurable identity, availability, history, streaming transport, and cancellation. Avoid hardcoded Rapidfire branding and `/api/ai/assistant`.
- Guest support: adapter supplies session creation, representative assignment, and account merge. Cookies, server actions, and guest tracking remain host responsibilities.
- Navigation: callbacks for conversation selection and opening full chat replace Next.js routing.
- UI: port HeroUI, Radix, icons, and motion to the chosen runtime. Ship scoped styles and configurable theme tokens.
- Optional host features: sounds, communications links, and support hours should be configurable rather than requiring the source app's contexts or admin configuration.

## Next stages

1. Done: choose Beast/Octane, establish package entry points, and verify the app imports the workspace package.
2. Done for the first slice: define adapter contracts, a memory adapter, and an optional legacy Convex adapter.
3. Done for text: port conversation list, message list, and composer as a working vertical slice.
4. Port receipts, reactions, attachments, audio, folders, assistant, dock, and guest lifecycle.
5. Add the source backend adapter separately, verify consuming-app imports, and document integration examples.

Do not publish or connect the playground to the production backend as part of extraction.

## Performance findings and backend direction

The source `convex/messages/q.ts` queries both directions with unbounded `collect()`, sorts full histories, and resolves all attachment URLs on updates. Its conversation queries also include unbounded user/guest/staff scans. The compatibility adapter retains these costs; its render window must not be mistaken for server pagination.

The next backend stage should add a stable conversation ID and an indexed visible-message timeline, paginate that timeline, and maintain per-member conversation summaries/unread counts transactionally. Backfill old messages in bounded resumable batches. Keep existing tables/endpoints during migration; reuse host auth and verify membership on every operation. Measure query reads, subscription payloads, and long-history rendering before and after. Shared credentials may point at the source deployment, so adding a schema locally must preserve its existing tables.

Current UI changes: only the selected conversation subscribes; initial rendering is 50 messages; keyed native rows preserve DOM; offscreen messages use CSS content visibility; receipt writes depend on unread message changes; no Next.js/React/HeroUI/GSAP dependencies enter the playground bundle. These are implementation changes, not measured speedup claims.

## Registry integration

The CLI-installed Bubble, MessageScroller, and Button now live in `packages/chat/src/components/ui`, with compatibility wrappers under the app UI directory. The message thread uses stable-ID scroller items, prepend preservation, pinned follow behavior, and the return-to-latest control. Visibility tracking is disabled in Chat; scroll and observer measurements are frame-batched with cleanup. Native runtime tests cover reading-position preservation, pinned/unpinned append behavior, the return button, avoiding visibility scans, batching, and pending-frame cancellation.

The integration adds Base UI, CVA, and cn code to the playground. The initial total gzip build grew from 80.2 kB to approximately 107 kB; this is bundle cost, not a measured runtime speedup. Broader long-history browser benchmarks remain outstanding.

## UI and motion pass

The local playground now follows Compelling's monochrome surfaces, Geist typography, fine borders, and small orange accents. Phone layouts use separate inbox/thread screens, 44–48 px primary controls, safe-area spacing, and visual-viewport height updates for the keyboard. The textarea autosizes and keeps focus on send. Light/dark themes are supported.

Lenis is dynamically imported per message viewport with a demand-driven RAF loop; no continuous idle animation loop is enabled. Native touch momentum is retained. Reduced-motion preference bypasses smooth scrolling and send animations; changing that preference tears down or recreates the driver. New outgoing messages use native View Transitions around the committed Octane update, with a CSS fallback, while initial/prepended history and metadata updates remain immediate.

This pass adds approximately 5.4 kB gzip for the lazy Lenis chunk and 52.5 kB of self-hosted Latin variable fonts in the playground. The production build reports approximately 114 kB gzip of initial JavaScript/CSS. Fonts belong to the playground, not the library. These are asset measurements; sustained frame-rate and real-device keyboard benchmarks have not been established.
