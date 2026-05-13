# AGENT.md

> Operating manual for the next agent that picks up this repo. Read SOUL.md for "what" and "why"; read this for "how."

## Mission

You are inheriting a 2-person video calling web app called **VidMeet**, built with Next.js (pages router), PeerJS, and Tailwind. It deploys to Vercel without configuration. The user's spec is reproduced at the bottom of this file.

## Ground rules

1. **Don't break the no-account property.** No login, no localStorage of PII, no analytics. The current product fits in one breath. Keep it that way unless explicitly asked.
2. **Don't change the aesthetic without reading SOUL.md.** The look is intentional — single accent, serif display, mono labels, crosshairs, scan-line.
3. **Don't replace PeerJS without a plan.** The signaling-via-public-broker choice is what makes this Vercel-deployable in one file. If you swap it for a custom WebSocket broker, you must also move signaling to a host that supports persistent connections (Fly, Render, a separate Cloudflare Worker, etc.).
4. **WebRTC code is fragile.** Every change to `VideoCall.jsx` should be tested across two real browsers (Chrome desktop + Safari/Firefox or a phone). The conditional-render race for the remote `<video>` is the single most common foot-gun — re-read MEMORY.md before refactoring.
5. **The minimum-15-fps requirement is a hard floor.** It's enforced through `frameRate: { min: 15 }` in `mediaUtils.js` and `degradationPreference: 'balanced'` on the sender. Don't relax either without checking that the spec hasn't changed.

## Operational checklist for new tasks

When the user asks for a change, walk this checklist:

1. **Is it a cosmetic change?** Read SOUL.md first. Keep the palette, typography, decorations.
2. **Is it a feature change?** Check MEMORY.md "What I would do next" — the user might be asking for exactly that.
3. **Does it touch `VideoCall.jsx`?** If yes, identify which state in the state machine you're changing. The states are: `initializing → waiting | connecting → connected → ended | error`. Make sure cleanup still runs in every exit path.
4. **Does it require a server-side process?** Vercel only gives us serverless functions. Anything persistent (chat room state, presence) needs an external broker. Don't pretend Vercel can host a WebSocket.
5. **Did you update MEMORY.md?** Append, don't rewrite. Future-you will thank present-you.

## Local development

```bash
npm install
npm run dev
```

For real two-machine testing you need HTTPS, because `getUserMedia` refuses to run on plain HTTP for non-localhost. Easiest path: `ngrok http 3000` and share the HTTPS URL with the other browser.

## Common changes & where to make them

| You want to… | Edit |
|---|---|
| Change the joining-code length or alphabet | `lib/utils.js` → `CODE_ALPHABET`, `generateRoomId` length |
| Add a TURN server | `lib/peerClient.js` → `DEFAULT_ICE_CONFIG.iceServers` |
| Change the video bitrate cap | `lib/mediaUtils.js` → `tuneSenderForLowLatency` |
| Change what gets copied into the invite | `lib/utils.js` → `buildInviteText` |
| Tweak the waiting screen wording | `components/VideoCall.jsx` → `WaitingPanel` |
| Add a new control button (mute, etc.) | `components/ControlBar.jsx` + state in `VideoCall.jsx` |
| Adjust the design tokens | `tailwind.config.js` + `styles/globals.css` |
| Change copy on the landing page | `pages/index.js` (only — keep marketing in one place) |

## Anti-patterns I observed are tempting

- **Don't use `useEffect` to attach the local stream to the video element by reading `localStreamRef` from inside `getMediaStream()` synchronously.** The video element isn't mounted yet (it's conditionally rendered behind `hasLocal`). The fix is the existing pattern: set the ref, flip the state, attach inside an effect keyed on the state.
- **Don't call `peer.call()` before `peer.on('open')` has fired.** The `createPeer()` promise wrapper already waits for `open`, so as long as you `await createPeer(…)` before doing anything else, you're safe.
- **Don't forget to clean up.** Every `useEffect` that creates a Peer, a getUserMedia stream, or a timer needs an explicit cleanup. There is a `teardown` closure inside the init effect that handles everything. If you add new resources, add them to that closure.
- **Don't render `VideoCall` from a Server Component context.** It uses `window`. Keep it loaded via `dynamic(() => …, { ssr: false })` as in `pages/call/[roomId].js`.

## Reading order for someone new

1. `README.md` — what the project is and how to run it.
2. `SOUL.md` — design philosophy. Read before any visual change.
3. `MEMORY.md` — build log, trade-offs, gotchas.
4. `AGENT.md` (this file) — operational rules.
5. Then dive into `components/VideoCall.jsx`. Everything else is supporting infrastructure.

## When you finish a task

- Run `npm run build` to make sure nothing broke at compile time.
- Append to `MEMORY.md` with the date, what you changed, and any new gotchas you found.
- Don't rewrite SOUL.md unless the product direction changes.

## Original user spec (preserved verbatim, lightly trimmed)

> Create a vercel deployable web app for video calling with audio. 2 person video call. Optimize the frames capture from camera to reduce the latency. Minimum frames in 1 second in the video call will be 15 and the audio should be clear. For inviting a joinee use link share or give joining code (make a copy button and override the functionality and add necessary information about who is the joinee like the name of the person who created the meeting and location, ip and proper joining link). When the meeting creator done creating the invite make sure he is switched to video call screen where his face is showing and showing the information like (waiting for joinee) just like how google meet does its thing. Use proper jsx syntax and double check the script logic. Properly handle the errors and make sure the application does not crash. Use JSF standards but don't overdo it (it's just for metaphor). Write your long-term memory in MEMORY.md at each end of the build. Add SOUL.md and AGENT.md files for making sure that your soul is preserved for future llms.

— Signed, the agent that built v1.
