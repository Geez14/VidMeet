# VidMeet

A small, sharp 2-person video calling app. Next.js + WebRTC (PeerJS) + Tailwind. Deploys to Vercel as-is.

```
+---------+      +-----------+      +----------+
|  HOST   | <—   |  PeerJS   |   —> |  GUEST   |
| browser |      | signaling |      | browser  |
+---------+      +-----------+      +----------+
       \____________________________/
              direct WebRTC media
                 (audio + video)
```

## Features

- Two-person video call, peer-to-peer (no media server)
- Minimum **15 fps** enforced via `getUserMedia` constraints; ideal 30 fps
- Echo cancellation + noise suppression + auto-gain on audio
- Bitrate cap (2.5 Mbps video / 64 kbps audio) for smoother streams on weak networks
- Joining code **and** direct link with **copy-override**: clipboard contains host, code, link, origin city, IP, timestamp
- Host lands on the call screen immediately after creating (face on screen, "Waiting for guest" panel beside)
- Live FPS / bitrate / RTT readout once connected
- Reconnect attempts on transient signaling drops
- Graceful fallbacks for older devices (constraint cascade)
- Top-level `ErrorBoundary`; per-promise try/catch elsewhere

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

### Testing across devices on the same Wi-Fi

`getUserMedia` is gated behind a **secure context** — `https://` or `http://localhost`. Opening `http://192.168.x.x:3000` on your phone from the dev server will fail with a camera-access error. Two ways to fix it:

```bash
# Option A — built-in self-signed cert (recommended)
npm run dev:https
# Next prints something like  https://0.0.0.0:3000
# On your phone, open  https://<your-laptop-ip>:3000
# Accept the certificate warning once.

# Option B — public HTTPS tunnel
npx ngrok http 3000
# Open the printed https://... URL on every device.
```

Either works. Production on Vercel is HTTPS by default, so this problem only exists in local LAN testing.

## Deploy to Vercel

```bash
npm i -g vercel       # one-time
vercel                # follow prompts
vercel --prod         # production
```

…or push to GitHub and import the repo in the Vercel dashboard. No environment variables required.

## Project map

```
pages/
  index.js              # landing page
  create.js             # host name entry → /call
  join.js               # guest code+name entry → /call
  call/[roomId].js      # dynamic call route (dynamic import; SSR off for WebRTC)
  api/ip.js             # reads request IP + Vercel geo headers
components/
  VideoCall.jsx         # the call lifecycle (media, peer, state machine)
  InviteCard.jsx        # rich-copy invite (the copy-override target)
  ControlBar.jsx        # mute / camera / end
  ErrorBoundary.jsx     # global app safety net
  Wordmark.jsx          # logo
lib/
  mediaUtils.js         # constraints + sender param tuning
  peerClient.js         # promisified PeerJS bootstrapping
  utils.js              # IDs, invite text builder, geo lookup
styles/
  globals.css           # tailwind + custom design tokens
```

## How the connection works

1. Host calls `createPeer(roomId)` — PeerJS registers `roomId` as the peer ID on its public signaling server.
2. Host waits on `peer.on('call', ...)` and `peer.on('connection', ...)`.
3. Guest calls `createPeer()` (anonymous) and then `peer.call(roomId, stream)`.
4. PeerJS exchanges SDP/ICE via the signaling server; media flows direct.
5. A small data channel exchanges names so each side sees the other's label.
6. Bitrate is capped via `RTCRtpSender.setParameters` once the peer connection exists.

## Constraints reference

```js
video: { frameRate: { ideal: 30, min: 15 }, width: 1280, height: 720 }
audio: { echoCancellation, noiseSuppression, autoGainControl, sampleRate: 48000 }
```

## Caveats

- PeerJS public signaling is fine for personal use; for production volume, self-host the broker.
- No TURN server is configured — most direct connections still succeed via STUN, but strict NATs may need a TURN relay. Add one to `DEFAULT_ICE_CONFIG` in `lib/peerClient.js` when needed.
- Both parties must reach the URL over HTTPS (Vercel handles this).
