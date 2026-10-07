# Changelog

All notable changes to `chat` will be recorded here.

## [Unreleased]

- Start the reusable chat library extraction from `rf` with backend-independent types and conversation-selection helpers.
- Establish the `@beast-chat/chat` workspace source package and native Beast chat playground.
- Add pluggable memory and optional legacy Convex adapters, bounded message rendering, text composer, receipts, and reactions.
- Verify native send, history loading, conversation switching, and subscription cleanup.
- Document source components, integration boundaries, performance findings, and remaining port stages.

- Integrate Beast registry bubbles and message scroller into the packaged chat UI.
- Preserve scroll position on prepends, add return-to-latest, batch observer/scroll work, and disable unused visibility measurements in chat.
- Restore Base UI 0.1.59 compatibility with Octane 0.8; configure CLI additions inside the library.
- Redesign the playground with Geist typography, monochrome light/dark themes, restrained orange accents, and full-screen mobile navigation.
- Add viewport-owned, lazy-loaded Lenis scrolling with demand-driven animation frames, native touch momentum, and reduced-motion support.
- Animate newly sent messages with native View Transitions and a CSS fallback; keep history and receipt updates out of send transitions.
- Add an autosizing, keyboard-aware mobile composer and safe-area spacing; fix initial pinning before history arrives.
- Fix sent-message capture timing by committing the bubble and scroll position inside the native snapshot callback; strengthen the upward glide and add a regression test.
- Add usable SwipeRow and PulseHeart app primitives with complete props/defaults, Octane-native motion, local icons, keyboard controls, and animation cleanup.
- Make `@beast-chat/chat` install-ready: MIT license, public `publishConfig`, shipped `LICENSE`, and subpath exports for `./composer`, `./message-thread`, `./icon`, and `./hooks`; root `ChatIcon` export replaces the playground's deep relative icon import.
- Repoint `beast-ui.json` lib/styles targets into `packages/chat` so future registry installs land in the shippable package.
- Add controlled `selectedFid` selection with `onSelectConversation(fid | null)` host routing (back reports `null`) and a `smoothScroll` opt-out on `Chat`/`MessageThread`; cover both with native runtime tests.
- Document consumer install, stylesheet/Tailwind setup, controlled selection, and the small-history limit of the compatibility Convex adapter.
- Match the packaged `@layer components` block to the canonical beast-ui bubble preview (`bg-positive/10`, `bg-surface`); add beast-ui's `surface`/`positive` tokens to the playground theme and wire it so the build resolves all preview utilities.
