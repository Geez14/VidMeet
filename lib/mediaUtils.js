// lib/mediaUtils.js
// Media acquisition tuned for low-latency, minimum 15fps, clean audio.

/**
 * Acquire camera + mic with constraints optimized for a 2-person call.
 *
 * Notes:
 *  - frameRate.min: 15 ensures we don't drop below the spec
 *  - frameRate.ideal: 30 for fluid motion when bandwidth allows
 *  - audio AGC + noise suppression + echo cancellation for clarity
 *  - latency hint kept low; channelCount mono for less bandwidth
 *  - Tries decreasing fallbacks so old devices still work.
 */
const PRIMARY_CONSTRAINTS = {
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, min: 15 },
    facingMode: 'user',
    aspectRatio: { ideal: 16 / 9 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
    latency: { ideal: 0.01 },
  },
};

const FALLBACK_CONSTRAINTS = [
  // Lower res, still 15+ fps
  {
    video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, min: 15 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  },
  // Bare minimum
  { video: true, audio: true },
  // Audio only — last resort if camera totally fails
  { video: false, audio: true },
];

export async function getMediaStream() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    // Most common cause in practice: page loaded over plain http on a non-localhost
    // origin (e.g. accessing dev server from a phone via LAN IP). Browsers gate
    // mediaDevices behind a secure context. Surface this specifically so the user
    // knows it's not their browser — it's the URL.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      const host = window.location?.host || 'this URL';
      throw new Error(
        `Camera and microphone need a secure connection. ${host} is plain http, ` +
        `which browsers block from accessing media devices. Use https://, deploy ` +
        `to Vercel, or run dev with "npm run dev:https" and reopen on the LAN.`
      );
    }
    throw new Error('Your browser does not support camera/microphone access.');
  }

  const attempts = [PRIMARY_CONSTRAINTS, ...FALLBACK_CONSTRAINTS];
  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempts[i]);
      return stream;
    } catch (err) {
      lastError = err;
      // If permission denied, no point retrying with looser constraints
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        break;
      }
    }
  }

  throw mapMediaError(lastError);
}

function mapMediaError(err) {
  if (!err) return new Error('Unable to access media devices.');
  const name = err.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new Error('Camera/microphone permission was denied. Allow access in your browser settings.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new Error('No camera or microphone found on this device.');
    case 'NotReadableError':
    case 'TrackStartError':
      return new Error('Camera or microphone is in use by another application.');
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new Error('Your device cannot meet the required video quality settings.');
    case 'AbortError':
      return new Error('Media access was aborted. Please try again.');
    default:
      return new Error(err.message || 'Could not access media devices.');
  }
}

/**
 * Apply a sensible video sender encoding cap so the peer-to-peer call
 * does not waste bandwidth at the cost of latency. Targets ~1.2 Mbps SD,
 * 2.5 Mbps HD; degradationPreference: 'balanced' keeps fps reasonable.
 */
export async function tuneSenderForLowLatency(peerConnection) {
  if (!peerConnection || typeof peerConnection.getSenders !== 'function') return;
  try {
    const senders = peerConnection.getSenders();
    for (const sender of senders) {
      if (!sender.track) continue;
      if (sender.track.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 2_500_000; // 2.5 Mbps cap
        params.encodings[0].maxFramerate = 30;
        params.degradationPreference = 'balanced';
        try {
          await sender.setParameters(params);
        } catch (_) {
          /* some browsers refuse mid-call; ignore */
        }
      }
      if (sender.track.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 64_000; // mono speech
        try {
          await sender.setParameters(params);
        } catch (_) {
          /* ignore */
        }
      }
    }
  } catch (err) {
    // Non-fatal
    // eslint-disable-next-line no-console
    console.warn('tuneSenderForLowLatency failed:', err);
  }
}

export function stopStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try { t.stop(); } catch (_) { /* noop */ }
    });
  } catch (_) {
    /* noop */
  }
}

export function setTrackEnabled(stream, kind, enabled) {
  if (!stream) return false;
  let changed = false;
  stream.getTracks().forEach((t) => {
    if (t.kind === kind) {
      t.enabled = !!enabled;
      changed = true;
    }
  });
  return changed;
}

export function getStreamHealth(stream) {
  if (!stream) return { video: false, audio: false };
  return {
    video: stream.getVideoTracks().some((t) => t.readyState === 'live'),
    audio: stream.getAudioTracks().some((t) => t.readyState === 'live'),
  };
}
