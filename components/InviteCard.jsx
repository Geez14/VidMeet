import { useEffect, useMemo, useState } from 'react';
import {
  buildInviteText,
  buildJoinUrl,
  formatRoomCodeForDisplay,
  fetchMeetingInfo,
} from '@/lib/utils';

/**
 * InviteCard
 *
 * Displays meeting metadata and a copy-override button. The copied payload is
 * rich text (host name, code, link, location, IP, timestamp) — not just a URL.
 *
 * Props:
 *   - roomId:   string  (required)
 *   - hostName: string  (required)
 *   - variant:  'standalone' | 'inline'  (cosmetic)
 *   - compact:  boolean (smaller padding for in-call display)
 */
export default function InviteCard({
  roomId,
  hostName,
  variant = 'standalone',
  compact = false,
}) {
  const [hostInfo, setHostInfo] = useState({ ip: '…', city: null, region: null, country: null });
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState('idle'); // idle | copied | error
  const [linkCopyState, setLinkCopyState] = useState('idle');

  const displayCode = useMemo(() => formatRoomCodeForDisplay(roomId), [roomId]);
  const joinUrl = useMemo(() => buildJoinUrl(roomId), [roomId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMeetingInfo()
      .then((info) => {
        if (cancelled) return;
        setHostInfo(info);
      })
      .catch(() => {
        if (cancelled) return;
        setHostInfo({ ip: 'Unknown', city: null, region: null, country: null });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inviteText = useMemo(
    () => buildInviteText({ roomId, hostName, hostInfo, joinUrl }),
    [roomId, hostName, hostInfo, joinUrl]
  );

  async function copyToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // fall through to legacy
      }
    }
    // Legacy fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function handleCopyInvite() {
    const ok = await copyToClipboard(inviteText);
    setCopyState(ok ? 'copied' : 'error');
    setTimeout(() => setCopyState('idle'), 2200);
  }

  async function handleCopyLink() {
    const ok = await copyToClipboard(joinUrl);
    setLinkCopyState(ok ? 'copied' : 'error');
    setTimeout(() => setLinkCopyState('idle'), 2200);
  }

  const location =
    [hostInfo.city, hostInfo.region, hostInfo.country].filter(Boolean).join(', ') || 'Unknown';

  return (
    <div
      className={`card relative overflow-hidden ${compact ? '!p-5' : ''} ${
        variant === 'inline' ? 'bg-ink-800/60' : ''
      }`}
    >
      {/* Corner decorations — full layout only. In compact mode the card's
          padding drops to 20px, but the crosshairs at top-3/right-3 (12px) would
          overlap the content (the v1.0 label sits in the upper-right corner).
          Suppress them rather than risk visual collision in the side panel. */}
      {!compact && (
        <>
          <div className="crosshair top-3 left-3" aria-hidden="true" />
          <div className="crosshair top-3 right-3" aria-hidden="true" />
          <div className="crosshair bottom-3 left-3" aria-hidden="true" />
          <div className="crosshair bottom-3 right-3" aria-hidden="true" />
        </>
      )}

      <div className="flex items-center gap-3 mb-4">
        <span className="font-body text-[10px] tracking-[0.2em] text-signal">
          // INVITE PACKET
        </span>
        <div className="h-px flex-1 bg-bone-100/10" />
        <span className="font-body text-[10px] tracking-[0.2em] text-bone-200/40">
          v1.0
        </span>
      </div>

      <div className="grid gap-5">
        <div>
          <div className="field-label mb-2">Joining Code</div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`font-display ${
                compact ? 'text-3xl' : 'text-4xl md:text-5xl'
              } tracking-tight select-all break-all`}
            >
              {displayCode}
            </span>
            <span className="font-body text-[10px] tracking-widest text-bone-200/40 whitespace-nowrap">
              CASE-INSENSITIVE
            </span>
          </div>
        </div>

        <div>
          <div className="field-label mb-2">Direct Link</div>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={joinUrl}
              onClick={(e) => e.target.select()}
              className="field-input font-body text-sm flex-1 min-w-0"
              aria-label="Direct join link"
            />
            <button
              onClick={handleCopyLink}
              className="btn-ghost !py-2 !px-4 shrink-0"
              type="button"
              aria-label="Copy direct link"
            >
              {linkCopyState === 'copied' ? '✓ Link' : linkCopyState === 'error' ? 'Failed' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Host" value={hostName} />
          <Stat label="Origin" value={loading ? '…' : location} />
          <Stat label="Network IP" value={loading ? '…' : hostInfo.ip} mono />
          <Stat label="Created" value={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
        </div>

        <div className="border-t border-bone-100/8 pt-5 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="btn-primary flex-1"
            aria-label="Copy full invite with metadata"
          >
            {copyState === 'copied' ? (
              <>
                <CheckIcon /> Full invite copied
              </>
            ) : copyState === 'error' ? (
              <>Copy failed</>
            ) : (
              <>
                <CopyIcon /> Copy full invite
              </>
            )}
          </button>
        </div>

        <div
          className="mt-1 flex items-start gap-3 border border-signal/25 bg-signal/5 rounded-md px-3 py-2.5"
          role="note"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-signal/15 text-signal flex-shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="12" opacity="0.0" />
              <path d="M11 7h2v7h-2zM11 16h2v2h-2z" />
            </svg>
          </span>
          <div className="text-[12px] leading-snug min-w-0 flex-1">
            <div className="font-body text-[10px] tracking-[0.22em] text-signal mb-0.5">
              // SINGLE-USE CODE
            </div>
            <div className="text-bone-200/80">
              This code expires the moment you end the call. Share it now — it
              can&apos;t be reused later.
            </div>
          </div>
        </div>

        <p className="font-body text-[10px] tracking-[0.18em] text-bone-200/40">
          // The full invite includes host, code, link, origin, IP and timestamp.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, mono = false }) {
  return (
    <div>
      <div className="field-label mb-1">{label}</div>
      <div className={`text-bone-100 ${mono ? 'font-body text-sm' : ''} truncate`}>{value}</div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15V6a2 2 0 012-2h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
