// lib/peerClient.js
// Thin wrapper around PeerJS that:
//   - centralizes our ICE server config (Google STUN; a public TURN could be added)
//   - exposes a promise-based createPeer() with timeout
//   - returns an opinionated default peer ID on the host side

let PeerCtor = null;

async function loadPeerJs() {
  if (PeerCtor) return PeerCtor;
  // Dynamic import to keep PeerJS out of the SSR bundle
  const mod = await import('peerjs');
  PeerCtor = mod.default || mod.Peer || mod;
  return PeerCtor;
}

const DEFAULT_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

/**
 * Create a Peer with optional explicit ID. Returns a promise that resolves
 * once PeerJS signals 'open' (i.e. our peer ID is registered on the signaling
 * server), or rejects on fatal errors / timeout.
 *
 * @param {string|undefined} id    Optional explicit peer id
 * @param {object} [options]
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<Peer>}
 */
export async function createPeer(id, options = {}) {
  const Peer = await loadPeerJs();
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise((resolve, reject) => {
    let settled = false;

    const peerOpts = {
      debug: 1,
      config: DEFAULT_ICE_CONFIG,
    };

    let peer;
    try {
      peer = id ? new Peer(id, peerOpts) : new Peer(peerOpts);
    } catch (err) {
      reject(err);
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { peer.destroy(); } catch (_) {}
      reject(new Error('Could not reach signaling server. Check your connection and try again.'));
    }, timeoutMs);

    peer.on('open', (peerId) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(peer);
    });

    peer.on('error', (err) => {
      // Only fail the initial connection on fatal pre-open errors.
      // After the peer is open, callers attach their own error listener.
      if (settled) return;
      const fatal =
        err.type === 'unavailable-id' ||
        err.type === 'browser-incompatible' ||
        err.type === 'server-error' ||
        err.type === 'socket-error' ||
        err.type === 'invalid-id' ||
        err.type === 'invalid-key';
      if (fatal) {
        settled = true;
        clearTimeout(timer);
        try { peer.destroy(); } catch (_) {}
        const translated = translatePeerError(err);
        // Preserve the PeerJS error type on the rejected Error so callers
        // can branch on err.peerType (e.g. retry on 'unavailable-id').
        try { translated.peerType = err.type; } catch (_) {}
        reject(translated);
      }
    });
  });
}

export function translatePeerError(err) {
  if (!err) return new Error('Unknown peer error.');
  const type = err.type || '';
  const msg = err.message || '';
  switch (type) {
    case 'unavailable-id':
      // The PeerJS broker holds peer registrations for up to ~60 seconds after
      // disconnect, so re-opening a meeting URL immediately after closing it
      // can fail until that grace window elapses. After our bounded retries,
      // surface that honestly rather than telling the user to abandon a code
      // that's still actually theirs.
      return new Error('This meeting code is still being released by the signaling server (typically takes up to a minute). Wait a moment and try again, or start a fresh meeting.');
    case 'peer-unavailable':
      return new Error('The host is not online yet. Wait a moment and try again.');
    case 'browser-incompatible':
      return new Error('Your browser does not fully support WebRTC.');
    case 'network':
      return new Error('Network error: unable to reach the signaling server.');
    case 'server-error':
      return new Error('Signaling server is unavailable. Please try again shortly.');
    case 'socket-error':
    case 'socket-closed':
      return new Error('Lost connection to the signaling server.');
    case 'webrtc':
      return new Error('A WebRTC error occurred during the call.');
    case 'disconnected':
      return new Error('Disconnected from the signaling server.');
    default:
      return new Error(msg || `Peer error (${type || 'unknown'}).`);
  }
}

/**
 * Wraps createPeer with bounded retries for transient registration failures
 * — specifically the `unavailable-id` case that fires when the PeerJS broker
 * still holds a stale registration of the same id from a previous session.
 * The broker auto-clears these after ~60s, so a few spaced retries usually
 * recover without minting a new id (which would break the shared link).
 *
 * Options:
 *   maxAttempts  number of total attempts (default 4)
 *   backoffMs    base delay between attempts; doubled each retry (default 1500)
 *   shouldRetry  (err) => boolean — only the matching errors retry (default: unavailable-id)
 *   mountedRef   optional React ref<{current: boolean}>; aborts if it flips false mid-wait
 *   onAttempt    optional (attempt, maxAttempts) callback for UI feedback
 */
export async function createPeerWithRetry(id, options = {}) {
  const {
    maxAttempts = 4,
    backoffMs = 1500,
    shouldRetry = (err) => err?.peerType === 'unavailable-id',
    mountedRef = null,
    onAttempt = null,
  } = options;

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (mountedRef && mountedRef.current === false) {
      throw new Error('Cancelled.');
    }
    try {
      if (onAttempt) onAttempt(attempt, maxAttempts);
      const peer = await createPeer(id);
      return peer;
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      // Exponential-ish backoff, capped
      const wait = Math.min(backoffMs * attempt, 6000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  // Defensive — unreachable in practice
  throw lastErr || new Error('Peer creation failed.');
}
