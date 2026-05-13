import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import {
  isValidRoomId,
  safeName,
  formatJoinInput,
} from '@/lib/utils';

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState(''); // formatted display string (no 'vm-' prefix)
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill code from query param (if user followed a direct link)
  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.code;
    if (typeof raw === 'string' && raw.length > 0) {
      const { display } = formatJoinInput(raw);
      setCode(display);
    }
  }, [router.isReady, router.query.code]);

  // Live-clean the input on every keystroke. The user can type/paste anything —
  // 'vm-XXXXX-XXXXX', 'XXXXX XXXXX', 'XXXXXXXXXX', a full URL, whatever — and
  // we collapse it to 'XXXXX-XXXXX' visually.
  function onCodeChange(e) {
    const { display } = formatJoinInput(e.target.value);
    setCode(display);
    if (error) setError(null);
  }

  const { normalized, bodyLen } = useMemo(() => {
    const { normalized } = formatJoinInput(code);
    return { normalized, bodyLen: normalized.replace(/^vm-/, '').length };
  }, [code]);

  const codeLooksReady = bodyLen >= 4;

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const cleanedName = safeName(name);
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (!isValidRoomId(normalized)) {
      setError('That code does not look right. Double-check it.');
      return;
    }

    setSubmitting(true);
    const url = `/call/${encodeURIComponent(normalized)}?host=0&name=${encodeURIComponent(
      cleanedName
    )}`;
    router.push(url);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 md:px-8 py-5 flex items-center justify-between border-b border-bone-100/8">
        <Wordmark />
        <Link
          href="/"
          className="font-body text-[11px] tracking-[0.18em] uppercase text-bone-200/60 hover:text-bone-100"
        >
          ← Home
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <div className="font-body text-xs tracking-[0.24em] text-signal mb-4 animate-in">
            // JOIN AN EXISTING ROOM
          </div>
          <h1 className="font-display text-5xl md:text-6xl mb-4 leading-[0.95] animate-in delay-1">
            Got a code?
            <br />
            Let&apos;s go.
          </h1>
          <p className="text-bone-200/70 mb-10 animate-in delay-2">
            Type the joining code your host sent you, plus your name. Camera
            and mic permission is asked once.
          </p>

          <form onSubmit={handleSubmit} className="grid gap-6 animate-in delay-3">
            <div className="field">
              <label htmlFor="join-name" className="field-label">Your name</label>
              <input
                id="join-name"
                type="text"
                placeholder="e.g. Avi P."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input text-lg"
                autoFocus
                maxLength={40}
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor="join-code" className="field-label">Joining code</label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 -translate-y-1/2 font-body text-sm tracking-[0.2em] text-bone-200/40 pointer-events-none select-none"
                >
                  vm-
                </span>
                <input
                  id="join-code"
                  type="text"
                  inputMode="text"
                  placeholder="XXXXX-XXXXX"
                  value={code}
                  onChange={onCodeChange}
                  className="field-input text-lg font-body tracking-[0.3em] uppercase pl-[3.25rem]"
                  maxLength={11}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="join-code-help"
                />
              </div>
              <div
                id="join-code-help"
                className="mt-2 flex items-center justify-between font-body text-[11px] tracking-[0.18em] uppercase text-bone-200/45"
              >
                <span>
                  {codeLooksReady ? (
                    <span className="text-bone-200/70">
                      Will join:{' '}
                      <span className="text-bone-100">{normalized}</span>
                    </span>
                  ) : (
                    <span>Dashes, spaces &amp; case don&apos;t matter</span>
                  )}
                </span>
                <span className={bodyLen > 0 ? 'text-bone-200/70' : 'text-bone-200/30'}>
                  {bodyLen}/10
                </span>
              </div>
            </div>

            {error && (
              <div className="font-body text-xs tracking-widest text-signal">
                // {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex-1 sm:flex-initial"
              >
                {submitting ? 'Connecting…' : 'Join meeting →'}
              </button>
              <Link href="/" className="btn-ghost">Cancel</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
