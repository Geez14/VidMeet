# SOUL.md

> For the next agent. Read before you touch anything cosmetic.

## What VidMeet is, in one sentence

A two-person video call that feels like passing a note in class — fast, deliberate, no ceremony.

## Aesthetic intent

The look is **editorial brutalism with one accent**. Think: a printed lab notebook, not a SaaS dashboard.

- **Palette**
  - Background: near-black `#08090b` (called `ink-900`)
  - Surface text: warm off-white `#f4f1ea` (`bone-100`)
  - Single accent: **signal red `#ff4d2e`**. It appears sparingly — on the primary CTA, on the `// COMMENT_STYLE` field labels, on the pulsing live dot, on the joining code's period in the wordmark, and inside the cited `<em>` in the hero.
  - Secondary accent (unused right now, reserved for ok-states): `moss #7ea25b`.
- **Typography**
  - `Instrument Serif` for display (large hero text, room codes, headers). Slightly literary; a quiet rebellion against the Inter/Geist consensus.
  - `JetBrains Mono` for tags, labels, stats, `// LIKE_THIS` margins. The monospace gives the UI its lab-notebook texture.
  - `Manrope` for body. Friendly, neutral, doesn't fight the serif.
- **Decoration**
  - Crosshairs (`.crosshair`) at the four corners of important cards. They are tiny survey marks — they communicate "this is a measured, specified object" without shouting.
  - A scan-line overlay on the waiting panel (`.scan-overlay`) — a slow vertical sweep that says "we're listening."
  - A subtle grain SVG over the whole body (`body::before`). Don't remove it; it kills the AI-glossiness.
  - A radial dot-grid on the body background.
  - A marquee on the landing page running mono-cased manifesto fragments. Don't make it scream; the speed and opacity were tuned to fade into peripheral vision.

## Tone of voice

Short, declarative, lowercase by default in body copy. Marketing-style headlines are fine when they're brief. **Never** punch up copy with emoji unless the user explicitly does. **Never** use exclamation marks unless something is genuinely celebratory. The voice should read like Anthropic Cookbook docs more than like a startup landing page.

Examples of what the voice sounds like:

- ✅ "Two people. One conversation. Zero fuss."
- ✅ "We're tuning the camera."
- ✅ "Hope it was a good one."
- ❌ "🎉 Awesome! Let's get you connected!!"
- ❌ "Welcome to the future of video calling."

## Motion

- Page-load reveals stagger with `animate-in delay-1`, `-2`, `-3` (defined in `globals.css`). Don't add new staggered reveals everywhere — they're load decoration, not interaction language.
- The only repeating animations are the live dot pulse, the scan overlay, and the marquee. Keep it that way.
- Hover lifts on the primary CTA (`btn-primary:hover { translateY(-1px) }`) and a glow shadow. That's it.

## "JSF standards but don't overdo it"

The user's metaphor (their words). It means: predictable structure, sensible separation, explicit error handling — but no over-engineering. So: one component per file, plain JSX, no state libraries, no router middleware, no IoC patterns. Hooks where helpful; refs for imperative bits (video elements, peer connections). Function components only.

## Copy-override invite

This was a specific ask. The "Copy" button does **not** copy a URL — it copies a labeled block:

```
You are invited to a VidMeet video call.

Host:           Yara K.
Joining Code:   ABCDE-FGHIJ
Direct Link:    https://vidmeet.vercel.app/join?code=vm-ABCDEFGHIJ

Meeting origin
  Location:     Kolkata, West Bengal, IN
  Network IP:   203.0.113.42
  Created:      May 14, 2026, 2:14 PM

Open the direct link, or visit VidMeet and enter the joining code.
— VidMeet
```

If you ever simplify this, keep the "labels + values, monospace block" rhythm. People should be able to paste this into Gmail, iMessage, or Slack and have it read like a real invite.

## The waiting screen behavior

This was emphasized in the spec: when the host finishes creating, switch them straight to the call screen, face visible, with a "waiting for guest" panel like Google Meet does. The implementation: `create.js` immediately navigates to `/call/[roomId]?host=1` after the user submits their name. On the call page, while `hasRemote === false`, the main video tile becomes a `WaitingPanel` with the room code visible — but the *user's own face* is still visible in the picture-in-picture tile underneath. The InviteCard is rendered in the side panel so the host can copy the invite **from inside the call**, not on a separate page.

Don't break this flow. The "create the invite, then go to call" two-step is what was requested. Keep the host's video visible the whole time.

## Don'ts

- Don't add a purple-blue gradient. The accent stays red, alone.
- Don't replace the serif with Inter or Geist or anything from the system stack.
- Don't add a chat panel "because video calls have chat." VidMeet is two people for a few minutes. Keep the surface area tiny.
- Don't add user accounts or persistence. The whole appeal is no-account.
- Don't add tracking. There's no analytics in this codebase. Keep it that way.

## If you must add features

The MEMORY.md "What I would do next" list is the priority order. Screen share is the next obvious addition; everything else can wait.
