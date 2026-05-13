// components/ControlBar.jsx
export default function ControlBar({
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onEnd,
  stats,
}) {
  return (
    <div className="flex items-center justify-center gap-3 md:gap-4">
      <button
        type="button"
        onClick={onToggleMic}
        className={`btn-icon ${micOn ? '' : 'muted'}`}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        title={micOn ? 'Mute mic' : 'Unmute mic'}
      >
        {micOn ? <MicIcon /> : <MicOffIcon />}
      </button>

      <button
        type="button"
        onClick={onToggleCam}
        className={`btn-icon ${camOn ? '' : 'muted'}`}
        aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
        title={camOn ? 'Camera off' : 'Camera on'}
      >
        {camOn ? <CamIcon /> : <CamOffIcon />}
      </button>

      <button
        type="button"
        onClick={onEnd}
        className="btn-icon danger"
        aria-label="End call"
        title="End call"
      >
        <PhoneDownIcon />
      </button>

      {stats && (
        <div className="hidden md:flex ml-4 items-center gap-3 font-body text-[10px] tracking-[0.2em] text-bone-200/50">
          <span>FPS {stats.fps ?? '–'}</span>
          <span>BR {stats.bitrateKbps ?? '–'} kb/s</span>
          <span>RTT {stats.rttMs ?? '–'} ms</span>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 9v3a3 3 0 003 3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 11.5V6a3 3 0 00-5.6-1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 001.9 4.8M19 11a7 7 0 01-1.4 4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 10l5-2.5v9L16.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function CamOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 14l5 2.5v-9L16.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M2.5 8v8a2 2 0 002 2h11" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function PhoneDownIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 11a13 13 0 0118 0l-2.5 2.5a1 1 0 01-1.4 0l-1.7-1.7a1 1 0 00-1.1-.2 9 9 0 00-5.5 0 1 1 0 00-1.1.2l-1.7 1.7a1 1 0 01-1.4 0L3 11z"
        fill="currentColor"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}
