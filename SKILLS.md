# SKILLS.md

> A skills handbook for the agent picking up VidMeet. Read this before adding components, fixing bugs, or extending features. It encodes the patterns this codebase already uses and the traps that took multiple rounds to find.
>
> Companion documents: **MEMORY.md** (build log of decisions and bugs), **SOUL.md** (aesthetic intent), **AGENT.md** (operating rules).

---

## 0. Mental model

VidMeet is a **stateless, BYO-broker** WebRTC app. There is no database, no auth, no server-side session. Everything that looks like "state" lives in one of three places:

| Layer | What's there | Lifetime |
|---|---|---|
| React refs in `VideoCall.jsx` | `MediaStream`, `Peer`, `MediaConnection`, `DataConnection`, timers | the call |
| URL (`/call/[roomId]?host=1&name=…`) | the room id, host flag, optional name | a tab |
| `sessionStorage` (`vm:expired-rooms`) | room ids this tab has finished with | a tab |

There is no shared server-side truth. "Expiration" is a UX convention enforced by (a) destroying the PeerJS registration so guests dialing the id get `peer-unavailable`, and (b) a per-tab `sessionStorage` flag so the back button doesn't revive the room.

If you add anything that needs cross-device persistence (chat history, scheduled meetings, recordings) you must introduce a backing store. The current architecture has none.

---

## 1. Secure-context skill — `getUserMedia` and HTTPS

`navigator.mediaDevices` only exists in a **secure context**. The browser defines secure contexts as `https://`, `http://localhost`, and `http://127.0.0.1`. Plain `http://` on a LAN IP is **not** secure and `navigator.mediaDevices` will be `undefined`.

**Symptom we already hit:** "Your browser does not support camera/microphone access" on every device that wasn't the dev host. The message was the literal truth for the browser — `mediaDevices` was missing — but the cause was the URL, not the browser.

**Detection pattern (already in `lib/mediaUtils.js`):**

```js
if (!navigator.mediaDevices?.getUserMedia) {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new Error('Camera/microphone need a secure connection (https or localhost). …');
  }
  throw new Error('Your browser does not support camera/microphone access.');
}
```

`window.isSecureContext === false` is the canonical "you're on plain http on a real hostname" check. Always branch on it before claiming "browser unsupported".

**LAN testing recipe:**

```bash
npm run dev:https      # Next.js generates a self-signed cert
# then phone → https://<laptop-ip>:3000 → accept cert warning
```

`dev:https` is wired in `package.json` as `next dev --experimental-https -H 0.0.0.0`. The `-H 0.0.0.0` binds to all interfaces so the LAN can reach it; without it, it binds to localhost only.

Production on Vercel is HTTPS by default, so this only matters for dev.

---

## 2. PeerJS lifecycle skill

PeerJS is a thin WebRTC + signaling wrapper. The signaling broker is `peerjs.com` (free, public). We don't run our own.

### Peer ID lifecycle

A peer registers with an id on the broker. Three things to know:

1. **The broker holds stale ids for ~60 seconds** after a disconnect. If a host page Fast-Refreshes during dev or a tab reloads before the prior socket times out, registering the same id throws `unavailable-id` ("ID is taken").
2. **Recovery is "retry the same id, don't mint a new one."** Earlier in the build we tried minting a fresh id on `unavailable-id` and silently swapping URLs, which broke the host-comes-back-later flow (host's shared link suddenly pointed to a different meeting). The right answer is `createPeerWithRetry` in `lib/peerClient.js` — it retries the same id up to 4 times with backoff (1.5s, 3s, 4.5s, 6s capped). Total ~15s worst case; covers the broker timeout.
3. **Once `peer.destroy()` is called, the id is released.** This used to be how we enforced "code expires when host ends" — that idea is dead (see §6). Now `peer.destroy()` is just media-session cleanup. Anyone with the link can re-register the same id and start a new session under it, for as long as the embedded TTL allows.
4. **Anonymous peers** (no id passed to `createPeer(undefined)`) get a broker-assigned id. Guests are anonymous. Hosts pass the room id explicitly.

### Error types we handle

| `err.type` | Where it fires | What we do |
|---|---|---|
| `unavailable-id` | host registration | `createPeerWithRetry` retries the SAME id with backoff |
| `peer-unavailable` | guest dialing absent host | Retry once after 1.2s, then surface "host not online" |
| `browser-incompatible` | feature detection | Hard error |
| `network` / `socket-error` / `disconnected` | mid-call | `peer.reconnect()` if possible, hard error otherwise |
| `webrtc` | media negotiation | Surface to error UI |

All translations live in `lib/peerClient.js::translatePeerError`. The original `err.type` is preserved on the rejected `Error` as `err.peerType` so callers can branch on it (that's how the retry helper recognizes `unavailable-id`).

### ICE config

`DEFAULT_ICE_CONFIG` lists Google + Twilio STUN servers. STUN is enough for ~80% of peer-to-peer connections; the rest need a TURN relay (symmetric NAT). **There is no TURN** configured. If you start seeing "connected" status but no media on certain networks, add a TURN server (e.g. Twilio NTS, Cloudflare TURN). It costs money. Document the env var pattern when you add it.

---

## 3. Media stream skill

### Acquisition cascade (`lib/mediaUtils.js::getMediaStream`)

We try four constraint sets in order:

1. 1280×720 @ ideal 30 / min 15 fps, mono audio with EC + NS + AGC
2. 640×360 @ ideal 24 / min 15 fps, same audio
3. Bare `{ video: true, audio: true }`
4. Audio only

`NotAllowedError` and `SecurityError` short-circuit (permission denied — no point retrying with looser constraints). Everything else falls through. The min-15-fps floor in step 1+2 is the prompt's hard requirement.

### Sender tuning (`tuneSenderForLowLatency`)

After the peer connection is up, we walk `pc.getSenders()` and clamp:
- video `maxBitrate = 2_500_000` (2.5 Mbps)
- audio `maxBitrate = 64_000` (64 kbps)
- `degradationPreference: 'balanced'` — drop resolution before fps when the link tightens (protects the 15-fps floor)

### Cleanup — the rule

**A stream is not stopped until you've called `.stop()` on every track.** Letting the `<video>` element drop the stream, or destroying the `Peer`, does **not** turn off the camera light. Always call `stopStream(streamRef.current)`.

The bug we hit: when the host sent `bye` and the guest flipped `status = 'ended'`, the guest's local stream was never stopped. The fix is in `VideoCall.jsx`: the `terminate()` callback is the single source of truth for terminal cleanup, called from both (a) the host's confirm-end handler (inline, before `router.replace` can unmount) and (b) a `useEffect([status])` watching for `'ended' | 'expired'` (catches the remote-bye path). It's idempotent — running it twice is safe.

---

## 4. State machine skill

`VideoCall.jsx` owns one state machine:

```
              ┌─────────────┐
              │initializing │
              └──────┬──────┘
                     │ acquire media + peer
        ┌────────────┼────────────┐
        │            │            │
        ▼ host       ▼ guest      ▼ on failure
   ┌────────┐  ┌────────────┐  ┌──────┐
   │waiting │  │ connecting │  │error │
   └───┬────┘  └─────┬──────┘  └──────┘
       │            │
       │            ▼
       │      ┌──────────┐
       └─────▶│connected │◀── guest hangs up: host → waiting
              └────┬─────┘
                   │ end / bye / abrupt disconnect
                   ▼
              ┌──────────┐
              │  ended   │  ──┐
              └──────────┘    │  terminate(): stop stream,
                              │  destroy peer, mark expired
              ┌──────────┐    │
              │ expired  │  ──┘  (set on re-mount if room is in sessionStorage)
              └──────────┘
```

**Invariants:**

- Only `'ended'` and `'expired'` are terminal. Everything else can transition.
- `connected → waiting` is host-only (guest dropped). `connected → ended` is the rest.
- `expired` is set **on mount** by reading `sessionStorage`. It can't be transitioned into from `connected` — for that, use `ended`.

When adding a state, update the state machine in two places: the rendering switch at the top of the return, and any effect/ref that depends on terminal-ness.

---

## 5. URL & navigation skill

### `router.replace` vs `router.push`

After ending a call, **always `router.replace('/')`**, never `router.push`. `push` leaves the call URL in browser history; pressing back drops the user back into the now-expired room. We learned this the hard way. Same applies to the error / ended / expired CTAs.

### URL is the room descriptor

`/call/<roomId>?host=1` is the host's URL. `/call/<roomId>?host=0&name=<encoded>` is the guest's. There is no other source of truth. If you need a new piece of "room state" available across page loads, it goes in the URL or in `sessionStorage` — there's no backend.

### Query parsing happens in `pages/call/[roomId].js`

That file is the thin shell: parse `host` and `name`, dynamic-import `VideoCall` with `ssr:false`, pass props. Keep call logic out of it.

---

## 6. Room expiration skill — the broker is the registry

**The problem:** without a backend, where does the "is this meeting currently alive?" truth live? We can't run a database. We can't run a persistent signaling server (Vercel is serverless). The PeerJS public broker only knows about *registered peers*, not arbitrary meeting metadata.

**The trick:** lean on the PeerJS broker as the registry. A meeting "exists" iff the host's peer id is currently registered with the broker. That's the entire model.

### Lifecycle

```
Host visits /create
   └─→ generateRoomId() → router.replace(/call/<id>?host=1)
   └─→ VideoCall mounts as host
   └─→ getMediaStream() acquires camera
   └─→ createPeer(id) registers id with broker  ← meeting is now "alive"
   └─→ status = 'waiting'

Guest visits the link
   └─→ VideoCall mounts as guest
   └─→ getMediaStream()
   └─→ createPeer(undefined) — anonymous
   └─→ peer.call(hostId, stream)
        ├─ Success → MediaConnection opens → status = 'connected'
        └─ peer-unavailable → host's id isn't on the broker:
           ├─ Retry up to MAX_DIAL_ATTEMPTS times (1.5s apart, ~6s total)
           │   — absorbs the sub-second race when guest arrives just
           │     before host's peer.on('open') fires
           └─ Still failing → status = 'expired' → "Meeting not found"

Host clicks End
   └─→ ConfirmModal → handleConfirmEnd
   └─→ dataConn.send({type:'bye'}) so guest flips fast
   └─→ terminate(): stop streams, peer.destroy() ← broker releases id
   └─→ markRoomExpired(roomId) ← per-tab back-button guard
   └─→ router.replace('/')

Host closes tab (no explicit end)
   └─→ React unmount → init useEffect teardown → peer.destroy()
   └─→ broker releases id (after ~60s grace) — meeting is gone
   └─→ NOTE: no markRoomExpired here, but it doesn't matter — broker is the truth
```

### What's local vs. global

| Layer | What it is | Cross-device? | Used for |
|---|---|---|---|
| PeerJS broker registration | host peer is online | ✅ yes | "Meeting exists" check — any guest dialing learns this |
| `markRoomExpired(roomId)` in `sessionStorage` | this tab finished this room | ❌ per-tab only | Back-button guard — same tab can't sneak back via history |

The broker is the authoritative cross-device signal. `markRoomExpired` is just a UX nicety so a host who just clicked End and got navigated home can't press back-arrow and end up in a dead room.

### Why `peer-unavailable` retries

There's a small race when the host clicks Create:

1. `t=0`: host clicks Create
2. `t=~10ms`: `router.replace('/call/<id>?host=1)` starts navigation
3. `t=~200ms`: VideoCall mounts, init effect fires
4. `t=~500-2000ms`: `getMediaStream()` resolves (camera permission + warmup)
5. `t=~700-2500ms`: `createPeer(id)` opens; broker registers the id

If the host immediately pastes the link and the guest opens it at `t < 2500ms`, the guest's dial will get `peer-unavailable` because the host's peer isn't registered yet. Without retries, the guest would see "Meeting not found" on a perfectly fresh, valid meeting.

`MAX_DIAL_ATTEMPTS = 4` with 1.5s spacing gives ~6s of grace — long enough to cover the typical host startup, short enough that a truly dead meeting doesn't keep the guest waiting.

If you tune these constants, keep both in `VideoCall.jsx` near the `dialAttemptsRef` declaration so they stay together.

### What "End meeting" means

- Releases your media (camera/mic)
- Destroys your peer → broker drops the registration
- Sends `bye` over the data conn so the other side transitions promptly
- Flags the room in `sessionStorage` so back-button doesn't revive it
- Navigates home with `router.replace` (call URL not in history)

The confirmation modal copy reflects this: "The joining code will expire — anyone who opens the link after this will see 'meeting not found'." Don't soften the copy unless you also change the behavior.

### When you'll need a backend

Some features the broker-as-registry can't support:

- **Host who joins later.** Host generates a link in advance and sends it; guest opens before host has joined. With this model the guest sees "Meeting not found" — there's no way to distinguish "never started" from "ended." A backend with `{ roomId, status: 'scheduled' | 'live' | 'ended', createdAt }` fixes this. *(George raised this case; we're deferring it.)*
- **Cross-device revoke.** Host on Device A wants to kill a meeting being held on Device B. Broker doesn't expose admin actions.
- **Audit log / participant history.** Nowhere to write.
- **Custom per-room TTL or scheduled expiry.** Same as above.

For all of these, lean on Vercel KV or Upstash Redis and add a `/api/rooms/[roomId]` endpoint that returns authoritative status. Keep the broker as the fast path (most requests don't need server hops).

---

## 7. Confirmation UI skill

`components/ConfirmModal.jsx` is the canonical way to ask "are you sure?". It already handles:

- Backdrop click → close
- Escape key → close
- Body scroll lock while open
- Auto-focus the primary action
- Focus return to the previous element on close
- ARIA `role="dialog"`, `aria-modal`, `aria-labelledby`

**Use it for anything destructive.** Don't roll a new modal. Don't use `window.confirm()` — it doesn't match the design system and can't be styled.

API:

```jsx
<ConfirmModal
  open={open}
  onClose={() => setOpen(false)}
  onConfirm={handleConfirm}
  label="// LABEL"        // mono accent line above title
  title="Question?"
  body={<>Explanation. Can be JSX.</>}
  confirmLabel="Do it"
  cancelLabel="Cancel"
  tone="danger"           // affects button styling; only 'danger' implemented today
/>
```

If you need a non-destructive confirm (e.g. info acknowledgement), add a `tone="default"` branch that keeps both buttons ghost-styled — don't add a new modal component.

---

## 8. Design system skill (see SOUL.md for intent)

| Token | What it is |
|---|---|
| `bg-ink-900` | near-black canvas |
| `text-bone-100` | primary text |
| `text-bone-200/70` | secondary text |
| `text-signal` | the one accent — coral / red-orange |
| `border-bone-100/8` | hairline divider |
| `font-display` | Instrument Serif — h1/h2 |
| `font-body` | JetBrains Mono — labels, codes, the `//` tags |
| (default) | Manrope — paragraphs |

Motifs: `// LABEL` mono lines, crosshair corners (`<span class="crosshair top-2 left-2" />`), scan overlay on waiting tiles, grain SVG over the body, dotted grid bg.

Helper classes in `styles/globals.css`: `card`, `btn-primary`, `btn-ghost`, `btn-icon`, `field`, `field-label`, `field-input`, `video-tile`, `tape`, `live-dot`, `scan-overlay`, `marquee`, `grid-bg`, `animate-in` (+ `.delay-1` … `.delay-3`).

**`react/jsx-no-comment-textnodes` is disabled** in `.eslintrc.json` because we render `// LABEL` as visible text. Don't turn it back on without a plan for every existing string.

---

## 9. How to add a new component — preflight checklist

Before writing a new component, walk through this:

1. **Does it touch media or peer?** If yes, route through `mediaUtils.js` / `peerClient.js`. Don't call `navigator.mediaDevices.getUserMedia` or `new Peer()` directly.
2. **Does it own state across renders?** If yes, prefer refs for stream/peer/timer handles, `useState` only for things that drive render.
3. **Does it have a destructive action?** Use `ConfirmModal`, not `window.confirm`.
4. **Does it render `//` mono labels?** Wrap them in `<div className="font-body text-xs tracking-[0.24em] text-signal">// LABEL</div>` — the eslint rule is off so you can write `// LABEL` as text.
5. **Does it navigate after a terminal action?** Use `router.replace`, never `router.push`.
6. **Does it consume the room id from a URL?** Validate with `isValidRoomId()`; normalize user input with `formatJoinInput()` (live-format) or `normalizeRoomCode()` (one-shot).
7. **Does it acquire camera/mic?** Reuse `getMediaStream` from `mediaUtils.js`. Don't bypass the secure-context check.
8. **Does it persist anything?** `sessionStorage` only, with a try/catch. No `localStorage` (private-mode hostility, no clear cleanup story).

---

## 10. Build & lint gotchas

- `next build` runs `next lint`. ESLint rules are pinned in `.eslintrc.json`. Three rules are off on purpose:
  - `react/no-unescaped-entities` — apostrophes in copy
  - `react/jsx-no-comment-textnodes` — see §8 above
  - `@next/next/no-page-custom-font` — fonts are loaded via `_document.js` preconnect; the linter doesn't recognize the pattern
- **React StrictMode is OFF** (`reactStrictMode: false` in `next.config.js`). Don't re-enable it without a plan for the PeerJS double-mount problem: strict mode runs every `useEffect` twice in dev, but `new Peer(id)` is a side effect that claims the id on a remote broker. The first mount registers, the cleanup destroys, the second mount tries to register the same id again — and the broker holds the registration in a ~60s grace window after disconnect. Net result: every dev page load hits `unavailable-id` and the user sees a bogus "meeting code is in use" error. Production builds don't double-mount, so this is purely a dev-time concern, but it makes the dev loop unusable. If you ever need strict-mode-style bug detection, do it on a non-WebRTC page.
- `next.config.js` sets `Permissions-Policy: camera=*, microphone=*` so Chrome doesn't strip media permissions on cross-origin embeds.
- The pages router (not app router) is intentional. Don't migrate without re-validating the `[roomId]` dynamic route + `/api/ip` shape.
- Node ≥ 18.17 is required (`engines` field). PeerJS 1.5.4 + Next 14.2.x is the tested combo.

---

## 11. What this app deliberately doesn't do

So you don't reimplement them by mistake:

- **No auth.** Codes are the only access control. Add at your peril — this is a 1-1 quick-meeting tool.
- **No persistence.** No history, no scheduling, no contacts. URL is the entire state.
- **No groups.** Two parties only. The peer model is point-to-point; group calls need an SFU (mediasoup, LiveKit). That's a different application.
- **No recording.** `MediaRecorder` would work but legal/UX surface area is enormous (consent flows, storage, region rules).
- **No chat history.** The data channel exists for `hello`/`bye` control messages only. Chat could be added but the messages are ephemeral by design — there's no store.

If a request lands for any of the above, push back or scope it as a separate project. The current architecture won't carry it gracefully.
