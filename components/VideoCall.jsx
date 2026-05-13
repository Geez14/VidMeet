import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  getMediaStream,
  setTrackEnabled,
  stopStream,
  tuneSenderForLowLatency,
} from '@/lib/mediaUtils';
import { createPeer, createPeerWithRetry, translatePeerError } from '@/lib/peerClient';
import { isValidRoomId, safeName, formatRoomCodeForDisplay, markRoomExpired, isRoomExpired } from '@/lib/utils';
import ControlBar from './ControlBar';
import ConfirmModal from './ConfirmModal';
import InviteCard from './InviteCard';
import Wordmark from './Wordmark';

/**
 * VideoCall — one component owning the entire call lifecycle.
 *
 * STATE MACHINE
 *   'initializing' — acquiring media and peer
 *   'waiting'      — host is online, no peer joined yet
 *   'connecting'   — joiner is dialing the host
 *   'connected'    — both sides streaming
 *   'ended'        — remote left or call closed normally
 *   'error'        — fatal error; user can retry / leave
 */
export default function VideoCall({ roomId, isHost, userName }) {
  const router = useRouter();
  const safeUserName = safeName(userName);

  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [peerName, setPeerName] = useState(null);
  const [hasLocal, setHasLocal] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);

  // Controls
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // End-confirmation modal
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  // Connection stats (best-effort; not all browsers expose the same fields)
  const [stats, setStats] = useState({ fps: null, bitrateKbps: null, rttMs: null });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const dataConnRef = useRef(null);
  const statsTimerRef = useRef(null);
  const lastBytesRef = useRef({ ts: 0, bytes: 0, framesDecoded: 0, frameTs: 0 });
  const mountedRef = useRef(true);

  // ---- Validation ----
  useEffect(() => {
    if (!isValidRoomId(roomId)) {
      setStatus('error');
      setError(new Error('Invalid meeting code.'));
      return;
    }
    // Per-tab back-button guard — this tab already ended this room
    if (isRoomExpired(roomId)) {
      setStatus('expired');
    }
  }, [roomId]);

  // ---- Initialization (media + peer) ----
  useEffect(() => {
    if (!isValidRoomId(roomId)) return undefined;
    if (isRoomExpired(roomId)) return undefined;
    mountedRef.current = true;

    let teardown = () => {};

    (async () => {
      try {
        setStatus('initializing');

        // 1) Acquire media first so we can attach to outgoing/incoming calls.
        const stream = await getMediaStream();
        if (!mountedRef.current) {
          stopStream(stream);
          return;
        }
        localStreamRef.current = stream;
        setHasLocal(true);

        // 2) Create the Peer — host registers using the room id, guest is anonymous.
        // The host might be re-entering their own room shortly after a previous
        // session closed; the PeerJS broker can hold their old registration for
        // up to ~60s, so we retry the SAME id with backoff rather than minting
        // a new one (the old behaviour broke the shared link).
        let peer;
        try {
          peer = await createPeerWithRetry(isHost ? roomId : undefined, {
            maxAttempts: 4,
            backoffMs: 1500,
            shouldRetry: (err) => isHost && err?.peerType === 'unavailable-id',
            mountedRef,
          });
        } catch (err) {
          throw err instanceof Error ? err : translatePeerError(err);
        }
        if (!mountedRef.current) {
          try { peer.destroy(); } catch (_) {}
          stopStream(stream);
          return;
        }
        peerRef.current = peer;

        // Attach a global error handler post-open for runtime errors
        peer.on('error', (err) => {
          if (!mountedRef.current) return;
          if (err.type === 'peer-unavailable' && !isHost) {
            // The host's peer id isn't registered with the broker. Could be:
            //   (a) The host just hit "create" and we beat their peer.on('open')
            //       — a small (sub-second) race. Worth retrying briefly.
            //   (b) The meeting was ended (host destroyed their peer) or never
            //       existed. After a few attempts, this is reality. Flip to
            //       'expired' so the user sees "Meeting not found" instead of
            //       waiting on a screen that will never connect.
            if (callRef.current) return; // already connected, ignore
            const attempt = dialAttemptsRef.current + 1;
            dialAttemptsRef.current = attempt;
            if (attempt >= MAX_DIAL_ATTEMPTS) {
              setStatus('expired');
              return;
            }
            setTimeout(() => {
              if (!mountedRef.current || callRef.current) return;
              tryDialHost();
            }, 1500);
            return;
          }
          // eslint-disable-next-line no-console
          console.warn('Peer runtime error:', err);
        });

        peer.on('disconnected', () => {
          // Try reconnecting to the signaling server (call media is unaffected)
          try { peer.reconnect(); } catch (_) {}
        });

        // 3) Wire up the role-specific behavior
        if (isHost) {
          setStatus('waiting');
          setupHostHandlers(peer, stream);
        } else {
          setStatus('connecting');
          tryDialHost();
        }

        // 4) Start stats polling once a call is up — initialized on connect
        teardown = () => {
          stopStatsPoll();
          if (dataConnRef.current) {
            try { dataConnRef.current.close(); } catch (_) {}
            dataConnRef.current = null;
          }
          if (callRef.current) {
            try { callRef.current.close(); } catch (_) {}
            callRef.current = null;
          }
          if (peerRef.current) {
            try { peerRef.current.destroy(); } catch (_) {}
            peerRef.current = null;
          }
          stopStream(localStreamRef.current);
          localStreamRef.current = null;
        };
      } catch (err) {
        if (!mountedRef.current) return;
        // eslint-disable-next-line no-console
        console.error('Init failure:', err);
        setError(err);
        setStatus('error');
      }
    })();

    return () => {
      mountedRef.current = false;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ---- Host: accept incoming call + data conn ----
  function setupHostHandlers(peer, stream) {
    peer.on('call', (incoming) => {
      try {
        incoming.answer(stream);
        wireCall(incoming);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Answer failed:', err);
      }
    });

    peer.on('connection', (conn) => {
      attachDataConn(conn);
    });
  }

  // Bounded retry counter for guest dial. The PeerJS broker is our "is the
  // meeting alive?" registry — if the host's id isn't registered, dialing
  // returns peer-unavailable. We retry a few times to absorb the small race
  // where the guest arrives milliseconds before the host's peer.on('open')
  // fires, then give up and surface "Meeting not found".
  const dialAttemptsRef = useRef(0);
  const MAX_DIAL_ATTEMPTS = 4; // ~6s total with 1.5s spacing

  // ---- Guest: dial host ----
  const tryDialHost = useCallback(() => {
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || !stream) return;

    try {
      const outgoing = peer.call(roomId, stream);
      if (!outgoing) {
        throw new Error('Unable to start the call.');
      }
      wireCall(outgoing);

      // Open a data channel for name exchange (best-effort)
      const conn = peer.connect(roomId, { reliable: true });
      attachDataConn(conn);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err);
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function wireCall(call) {
    callRef.current = call;

    call.on('stream', (remoteStream) => {
      if (!mountedRef.current) return;
      remoteStreamRef.current = remoteStream;
      // Attach immediately if already mounted (status change re-renders video tile)
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        try {
          remoteVideoRef.current.playsInline = true;
          remoteVideoRef.current.autoplay = true;
        } catch (_) {}
      }
      setHasRemote(true);
      setStatus('connected');

      // Tune sender parameters once the PC is established
      if (call.peerConnection) {
        tuneSenderForLowLatency(call.peerConnection);
        startStatsPoll(call.peerConnection);
      }
    });

    call.on('close', () => {
      if (!mountedRef.current) return;
      remoteStreamRef.current = null;
      setHasRemote(false);
      setStatus(isHost ? 'waiting' : 'ended');
      stopStatsPoll();
      callRef.current = null;
    });

    call.on('error', (err) => {
      if (!mountedRef.current) return;
      // eslint-disable-next-line no-console
      console.error('Call error:', err);
      setError(translatePeerError(err));
      setStatus('error');
    });
  }

  function attachDataConn(conn) {
    if (!conn) return;
    dataConnRef.current = conn;

    conn.on('open', () => {
      try {
        conn.send({ type: 'hello', name: safeUserName });
      } catch (_) {}
    });
    conn.on('data', (data) => {
      if (!mountedRef.current || !data || typeof data !== 'object') return;
      if (data.type === 'hello' && typeof data.name === 'string') {
        setPeerName(safeName(data.name));
      }
      // Only the host can end the meeting. We differentiate by who's receiving:
      //   - guest receives 'host-end' (or legacy 'bye') → meeting is over → expire
      //   - host receives anything → ignore; if guest is leaving, call.on('close')
      //     will fire and the host transitions back to 'waiting'
      if (!isHost && (data.type === 'host-end' || data.type === 'bye')) {
        setStatus('ended');
      }
    });
    conn.on('close', () => {
      dataConnRef.current = null;
    });
    conn.on('error', () => {
      // non-fatal; data channel is just for niceties
    });
  }

  // ---- Stats polling ----
  function startStatsPoll(pc) {
    stopStatsPoll();
    statsTimerRef.current = setInterval(async () => {
      try {
        const report = await pc.getStats(null);
        let inboundVideo = null;
        let outboundVideo = null;
        let rtt = null;

        report.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') inboundVideo = r;
          if (r.type === 'outbound-rtp' && r.kind === 'video') outboundVideo = r;
          if (r.type === 'remote-inbound-rtp' && r.kind === 'video' && r.roundTripTime != null) {
            rtt = r.roundTripTime;
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime;
          }
        });

        const now = performance.now();
        let fps = null;
        let bitrateKbps = null;

        if (inboundVideo) {
          // FPS — prefer reported; fall back to delta of framesDecoded
          if (typeof inboundVideo.framesPerSecond === 'number') {
            fps = Math.round(inboundVideo.framesPerSecond);
          } else if (typeof inboundVideo.framesDecoded === 'number') {
            const dt = (now - lastBytesRef.current.frameTs) / 1000;
            if (dt > 0 && lastBytesRef.current.framesDecoded) {
              fps = Math.round((inboundVideo.framesDecoded - lastBytesRef.current.framesDecoded) / dt);
            }
            lastBytesRef.current.framesDecoded = inboundVideo.framesDecoded;
            lastBytesRef.current.frameTs = now;
          }

          if (typeof inboundVideo.bytesReceived === 'number') {
            const dt = (now - lastBytesRef.current.ts) / 1000;
            if (dt > 0 && lastBytesRef.current.bytes) {
              const delta = inboundVideo.bytesReceived - lastBytesRef.current.bytes;
              bitrateKbps = Math.round((delta * 8) / 1000 / dt);
            }
            lastBytesRef.current.bytes = inboundVideo.bytesReceived;
            lastBytesRef.current.ts = now;
          }
        }

        if (!mountedRef.current) return;
        setStats({
          fps: fps ?? null,
          bitrateKbps: bitrateKbps ?? null,
          rttMs: rtt != null ? Math.round(rtt * 1000) : null,
        });
      } catch (err) {
        // Stats are non-critical
      }
    }, 1500);
  }

  function stopStatsPoll() {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
  }

  // ---- Attach streams to DOM ----
  // Effects run AFTER mount, which is critical because the <video> elements
  // are conditionally rendered. The refs are only valid post-mount.
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [hasLocal]);

  useEffect(() => {
    if (hasRemote && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [hasRemote]);

  // ---- Controls ----
  const handleToggleMic = useCallback(() => {
    const next = !micOn;
    setTrackEnabled(localStreamRef.current, 'audio', next);
    setMicOn(next);
  }, [micOn]);

  const handleToggleCam = useCallback(() => {
    const next = !camOn;
    setTrackEnabled(localStreamRef.current, 'video', next);
    setCamOn(next);
  }, [camOn]);

  // Idempotent terminal cleanup. Safe to call from any of:
  //   - the [status]-effect when status flips to 'ended'/'expired' (remote-bye path)
  //   - handleConfirmEnd directly (host-initiated path, before unmount)
  //   - the init useEffect's unmount teardown
  const terminate = useCallback(() => {
    // 1) Stop the local camera/mic tracks
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    // 2) Drop the remote stream from the <video>
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) {
      try { remoteVideoRef.current.srcObject = null; } catch (_) {}
    }
    // 3) Tear down peer + data conn so the broker releases this ID.
    //    Releasing the broker registration is what makes "code is dead" work
    //    cross-device — any other peer dialing this id will get peer-unavailable.
    if (dataConnRef.current) {
      try { dataConnRef.current.close(); } catch (_) {}
      dataConnRef.current = null;
    }
    if (callRef.current) {
      try { callRef.current.close(); } catch (_) {}
      callRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
      peerRef.current = null;
    }
    stopStatsPoll();
    // 4) Local back-button guard — this tab won't re-enter the dead room
    markRoomExpired(roomId);
  }, [roomId]);

  // Run terminal cleanup whenever the status flips to a terminal state.
  // Covers the remote-bye path where the guest used to leave their camera on.
  useEffect(() => {
    if (status !== 'ended' && status !== 'expired') return;
    terminate();
    setHasLocal(false);
    setHasRemote(false);
  }, [status, terminate]);

  // User clicked the end-call button. Show a confirmation first.
  const handleEnd = useCallback(() => {
    setConfirmEndOpen(true);
  }, []);

  // User confirmed in the modal — perform the end.
  const handleConfirmEnd = useCallback(() => {
    setConfirmEndOpen(false);
    // Signal the peer politely before tearing down so the other side flips to
    // 'ended' instead of waiting on a connection-close timeout.
    if (dataConnRef.current) {
      try { dataConnRef.current.send({ type: 'bye' }); } catch (_) {}
    }
    // Do the cleanup inline — router.replace below may unmount before any
    // [status]-effect gets a chance to fire.
    terminate();
    setHasLocal(false);
    setHasRemote(false);
    // Use replace, not push: the call URL stays out of history so the back
    // button doesn't drop the user (or PeerJS) back into the expired room.
    router.replace('/');
  }, [router, terminate]);

  // ---- Render ----
  const displayCode = useMemo(() => formatRoomCodeForDisplay(roomId), [roomId]);

  if (status === 'error') {
    return (
      <CallShell roomId={roomId}>
        <div className="card max-w-lg w-full mx-auto text-center">
          <div className="font-body text-xs tracking-[0.2em] text-signal mb-2">// ERROR</div>
          <h2 className="font-display text-3xl mb-3">{error?.message || 'Something went wrong.'}</h2>
          <p className="text-bone-200/70 mb-6">Try reloading, or head back home.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => router.reload()} className="btn-ghost">Retry</button>
            <button onClick={() => router.replace('/')} className="btn-primary">Home</button>
          </div>
        </div>
      </CallShell>
    );
  }

  if (status === 'expired') {
    return (
      <CallShell roomId={roomId}>
        <div className="card max-w-lg w-full mx-auto text-center">
          <div className="font-body text-xs tracking-[0.2em] text-signal mb-2">// NOT FOUND</div>
          <h2 className="font-display text-4xl mb-3">Meeting not found.</h2>
          <p className="text-bone-200/70 mb-6">
            The joining code <span className="font-body text-bone-100">{displayCode}</span>{' '}
            isn&apos;t active. Either it was ended, or the host hasn&apos;t started
            the meeting yet. Ask them to share a fresh link.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => router.replace('/create')} className="btn-primary">
              New meeting
            </button>
            <button onClick={() => router.replace('/')} className="btn-ghost">
              Home
            </button>
          </div>
        </div>
      </CallShell>
    );
  }

  if (status === 'ended') {
    return (
      <CallShell roomId={roomId}>
        <div className="card max-w-lg w-full mx-auto text-center">
          <div className="font-body text-xs tracking-[0.2em] text-signal mb-2">// EOF</div>
          <h2 className="font-display text-4xl mb-3">Call ended.</h2>
          <p className="text-bone-200/70 mb-6">
            Camera and mic released. This code is now expired and can&apos;t be reused.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => router.replace('/create')} className="btn-primary">
              New meeting
            </button>
            <button onClick={() => router.replace('/')} className="btn-ghost">
              Home
            </button>
          </div>
        </div>
      </CallShell>
    );
  }

  const isWaiting = status === 'waiting' || status === 'connecting' || status === 'initializing';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bone-100/8 px-4 md:px-8 py-4 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-3 md:gap-5 font-body text-[10px] tracking-[0.18em] text-bone-200/60">
          <span className="hidden sm:inline">ROOM</span>
          <span className="text-bone-100 font-bold">{displayCode}</span>
          <span className="hidden md:inline-flex items-center">
            <span className="live-dot" />
            {status === 'connected' ? 'LIVE' : status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-8 py-6 md:py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] max-w-[1500px] mx-auto">
          {/* Main stage */}
          <div className="grid gap-4">
            <div className="relative video-tile">
              {hasRemote ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full"
                />
              ) : (
                <WaitingPanel
                  status={status}
                  isHost={isHost}
                  code={displayCode}
                />
              )}
              {hasRemote && (
                <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-ink-900/70 backdrop-blur rounded-md text-sm">
                  {peerName || (isHost ? 'Guest' : 'Host')}
                </div>
              )}
              {hasRemote && (
                <div className="tape top-4 right-4">
                  <span className="live-dot" /> live
                </div>
              )}
            </div>

            <div className="relative video-tile local max-w-[260px] aspect-video">
              {hasLocal ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-bone-200/40 font-body text-xs tracking-widest">
                  CAMERA OFFLINE
                </div>
              )}
              {!camOn && hasLocal && (
                <div className="absolute inset-0 bg-ink-900/85 flex items-center justify-center font-body text-xs tracking-widest text-bone-200/50">
                  CAMERA OFF
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-ink-900/70 backdrop-blur rounded text-xs">
                You — {safeUserName}
              </div>
            </div>
          </div>

          {/* Side panel: waiting invite OR call info */}
          <aside className="grid gap-4 content-start">
            {isHost && isWaiting && (
              <InviteCard roomId={roomId} hostName={safeUserName} compact variant="inline" />
            )}

            {status === 'connected' && (
              <div className="card">
                <div className="font-body text-[10px] tracking-[0.2em] text-signal mb-3">
                  // CONNECTED
                </div>
                <p className="text-bone-200/80 mb-4">
                  You and <strong className="text-bone-100">{peerName || 'your guest'}</strong> are
                  live. Audio and video are end-to-end via WebRTC.
                </p>
                <div className="grid grid-cols-3 gap-3 font-body text-xs">
                  <Metric label="FPS" value={stats.fps ?? '–'} />
                  <Metric label="kb/s" value={stats.bitrateKbps ?? '–'} />
                  <Metric label="RTT" value={stats.rttMs != null ? `${stats.rttMs}ms` : '–'} />
                </div>
              </div>
            )}

            {!isHost && isWaiting && (
              <div className="card">
                <div className="font-body text-[10px] tracking-[0.2em] text-signal mb-3">
                  // DIALING
                </div>
                <h3 className="font-display text-2xl mb-2">Connecting to host…</h3>
                <p className="text-bone-200/70 text-sm">
                  Hold a moment while we reach <span className="text-bone-100">{displayCode}</span>.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>

      <footer className="px-4 md:px-8 py-5 border-t border-bone-100/8">
        <ControlBar
          micOn={micOn}
          camOn={camOn}
          onToggleMic={handleToggleMic}
          onToggleCam={handleToggleCam}
          onEnd={handleEnd}
          stats={status === 'connected' ? stats : null}
        />
      </footer>

      <ConfirmModal
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={handleConfirmEnd}
        label="// END MEETING"
        title="End this meeting?"
        body={
          <>
            Your camera and microphone will release immediately. The joining
            code <span className="font-body text-bone-100">{displayCode}</span>{' '}
            will expire — it can&apos;t be reused. Anyone who opens the link
            after this will see &ldquo;meeting not found&rdquo;.
          </>
        }
        confirmLabel="End meeting"
        cancelLabel="Keep talking"
      />
    </div>
  );
}

function CallShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-bone-100/8 px-4 md:px-8 py-4 flex items-center justify-between">
        <Wordmark />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">{children}</main>
    </div>
  );
}

function WaitingPanel({ status, isHost, code }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
      <div className="scan-overlay" aria-hidden="true" />
      <div className="font-body text-[10px] tracking-[0.3em] text-signal mb-3">
        {status === 'initializing'
          ? '// ACQUIRING SIGNAL'
          : isHost
          ? '// AWAITING GUEST'
          : '// DIALING HOST'}
      </div>
      <h2 className="font-display text-4xl md:text-6xl mb-3 max-w-2xl">
        {status === 'initializing'
          ? 'Tuning camera…'
          : isHost
          ? 'Waiting for your guest.'
          : 'Connecting…'}
      </h2>
      <p className="text-bone-200/60 max-w-md mb-6">
        {isHost
          ? 'Share the joining code or the direct link from the panel on the right. They will appear here when they join.'
          : 'We are reaching the host. This should only take a moment.'}
      </p>
      <div className="inline-flex items-center gap-3 px-4 py-2 border border-bone-100/12 rounded-full">
        <span className="live-dot" />
        <span className="font-body text-xs tracking-widest text-bone-200/70">
          ROOM&nbsp;{code}
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border border-bone-100/8 rounded-md px-3 py-2">
      <div className="text-[10px] tracking-[0.18em] text-bone-200/40">{label}</div>
      <div className="text-bone-100 text-sm">{value}</div>
    </div>
  );
}
