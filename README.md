# Beast chat library playground

Porting the React chat from `~/Code/rf` to a reusable native Beast/Octane library.

```sh
bun install
bun run dev
bun run check
bun test
```

The library lives in [`packages/chat`](packages/chat/README.md); `src/App.btsx` imports it as `@beast-chat/chat`. Consuming beast apps install the published package (`bun add @beast-chat/chat`); this repo's `workspace:*` pin is playground-only. The playground uses a memory adapter, so sending test messages does not contact the source backend. The library's optional Convex adapter can reuse the source endpoints through a host-owned authenticated client.

The playground has a monochrome Geist UI inspired by [Compelling](https://compelling.phtn458.workers.dev/worker), light/dark themes, phone navigation, and a keyboard-aware composer. Sent messages use View Transitions, with a CSS fallback. Lenis smooths wheel/programmatic scrolling; touch retains native momentum and reduced-motion settings are respected.

See [port scope and stages](docs/chat-library-port.md). The port currently includes conversation browsing/search, text messaging, receipts, likes, and bounded rendering. Assistant, guest support, dock, media tools, folders, and backend pagination remain.

Credential files are ignored. The library never reads app credentials or ships them in its package. No schema changes or deployments have been made.

The package ships authored source for matching Beast/Octane compilers, following [Octane's package guidance](https://octanejs.dev/docs/build-tools). It is not yet published.

App primitives are available at `src/components/ui/swipe-row.btsx` and `src/components/ui/pulse-like.btsx`. Import their default components directly. SwipeRow accepts an `actions` array and `onAction`/`onCommit` callbacks and uses the Octane 0.8-compatible motion package. PulseLike accepts `liked`, `count`, and `onChange`; its implementation ships as `@beast-chat/chat/pulse-like` and powers chat reactions. The app file is a compatibility wrapper.
