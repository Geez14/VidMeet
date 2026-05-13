import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import { normalizeRoomCode } from '@/lib/utils';

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function handleQuickJoin(e) {
    e.preventDefault();
    if (!code.trim()) return;
    const normalized = normalizeRoomCode(code);
    router.push(`/join?code=${encodeURIComponent(normalized)}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 md:px-8 py-5 flex items-center justify-between border-b border-bone-100/8">
        <Wordmark />
        <nav className="flex items-center gap-5 font-body text-[11px] tracking-[0.18em] text-bone-200/60 uppercase">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-bone-100 transition-colors"
          >
            Source
          </a>
          <Link href="/create" className="hover:text-bone-100 transition-colors">
            Start
          </Link>
        </nav>
      </header>

      <div className="marquee">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i} className="inline-flex items-center gap-12">
              <span>peer-to-peer · low latency · 15 fps minimum</span>
              <span>·</span>
              <span>no account · no sign-in · no friction</span>
              <span>·</span>
              <span>tape-and-string elegance</span>
              <span>·</span>
              <span>webrtc · audio AGC · echo cancelling</span>
              <span>·</span>
            </span>
          ))}
        </div>
      </div>

      <main className="flex-1 relative">
        {/* Big hero */}
        <section className="px-4 md:px-8 pt-16 md:pt-28 pb-20 max-w-[1500px] mx-auto">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 items-end">
            <div>
              <div className="font-body text-xs tracking-[0.24em] text-signal mb-5 animate-in">
                // V I D — M E E T &nbsp; · &nbsp; 2 0 2 6
              </div>
              <h1 className="font-display text-[clamp(3rem,9vw,7.5rem)] leading-[0.94] tracking-tight mb-8 animate-in delay-1">
                Two people.
                <br />
                One <em className="not-italic text-signal">conversation.</em>
                <br />
                Zero fuss.
              </h1>
              <p className="text-bone-200/75 text-lg md:text-xl max-w-xl mb-10 animate-in delay-2">
                A 2-person video call that just&nbsp;works. Press a button, share a code, and you&apos;re live.
                Encrypted peer-to-peer, no logins, never below 15&nbsp;fps.
              </p>

              <div className="flex flex-wrap gap-4 animate-in delay-3">
                <Link href="/create" className="btn-primary text-base">
                  <PlusIcon /> New meeting
                </Link>

                <form
                  onSubmit={handleQuickJoin}
                  className="flex items-stretch gap-2 max-w-md w-full sm:w-auto"
                >
                  <input
                    placeholder="Joining code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="field-input flex-1 sm:w-72 font-body tracking-widest uppercase"
                    aria-label="Joining code"
                    maxLength={20}
                  />
                  <button
                    type="submit"
                    disabled={!code.trim()}
                    className="btn-ghost"
                  >
                    Join →
                  </button>
                </form>
              </div>
            </div>

            <aside className="animate-in delay-4">
              <div className="card relative">
                <div className="crosshair top-3 left-3" />
                <div className="crosshair top-3 right-3" />
                <div className="crosshair bottom-3 left-3" />
                <div className="crosshair bottom-3 right-3" />
                <div className="font-body text-[10px] tracking-[0.2em] text-signal mb-4">
                  // SPECIMEN
                </div>
                <dl className="grid grid-cols-2 gap-y-5 gap-x-4 text-sm">
                  <dt className="text-bone-200/40 font-body text-[10px] tracking-widest">FRAMES/SEC</dt>
                  <dd className="font-display text-2xl">≥&nbsp;15</dd>

                  <dt className="text-bone-200/40 font-body text-[10px] tracking-widest">CAPACITY</dt>
                  <dd className="font-display text-2xl">2&nbsp;people</dd>

                  <dt className="text-bone-200/40 font-body text-[10px] tracking-widest">TRANSPORT</dt>
                  <dd className="font-display text-2xl">P2P</dd>

                  <dt className="text-bone-200/40 font-body text-[10px] tracking-widest">SETUP</dt>
                  <dd className="font-display text-2xl">~3s</dd>
                </dl>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-t border-bone-100/8 px-4 md:px-8 py-16 max-w-[1500px] mx-auto">
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            <Step n="01" title="Create" body="Tap New meeting, enter a name. We mint you a fresh, collision-resistant room code." />
            <Step n="02" title="Share" body="Hit Copy full invite — clipboard now holds host, code, link, origin, IP and time. Or share the link directly." />
            <Step n="03" title="Talk" body="The moment your guest joins, the waiting panel becomes their face. Audio is AGC-tuned and echo-cancelled." />
          </div>
        </section>

        <section className="border-t border-bone-100/8 px-4 md:px-8 py-12 max-w-[1500px] mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="font-body text-[10px] tracking-[0.2em] text-signal mb-2">// READY</div>
              <h3 className="font-display text-3xl md:text-4xl">Pick a side.</h3>
            </div>
            <div className="flex gap-3">
              <Link href="/create" className="btn-primary">New meeting</Link>
              <Link href="/join" className="btn-ghost">Join one</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 md:px-8 py-6 border-t border-bone-100/8 font-body text-xs tracking-widest text-bone-200/40 flex flex-col md:flex-row gap-3 justify-between">
        <span>© 2026 VidMeet · peer-to-peer over WebRTC</span>
        <span>Permission required: camera, microphone.</span>
      </footer>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div>
      <div className="font-body text-xs tracking-[0.2em] text-signal mb-3">// {n}</div>
      <h3 className="font-display text-3xl md:text-4xl mb-3">{title}</h3>
      <p className="text-bone-200/70">{body}</p>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
