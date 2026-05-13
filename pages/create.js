import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import { generateRoomId, safeName } from '@/lib/utils';

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const cleaned = safeName(name);
    if (cleaned === 'Guest' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      const roomId = generateRoomId();
      const url = `/call/${encodeURIComponent(roomId)}?host=1&name=${encodeURIComponent(cleaned)}`;
      router.push(url);
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Could not start the meeting.');
    }
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
            // NEW MEETING
          </div>
          <h1 className="font-display text-5xl md:text-6xl mb-4 leading-[0.95] animate-in delay-1">
            What should
            <br />
            we call you?
          </h1>
          <p className="text-bone-200/70 mb-10 animate-in delay-2">
            Your guest will see this name in their invite and on the call. We don&apos;t
            store it anywhere &mdash; it lives in the URL.
          </p>

          <form onSubmit={handleSubmit} className="grid gap-6 animate-in delay-3">
            <div className="field">
              <label htmlFor="name" className="field-label">Your name</label>
              <input
                id="name"
                type="text"
                placeholder="e.g. Yara K."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input text-lg"
                autoFocus
                maxLength={40}
                autoComplete="off"
              />
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
                {submitting ? 'Starting…' : 'Generate room & enter →'}
              </button>
              <Link href="/" className="btn-ghost">Cancel</Link>
            </div>
          </form>

          <div className="mt-14 pt-8 border-t border-bone-100/8 font-body text-[10px] tracking-[0.2em] text-bone-200/40 animate-in delay-4">
            // After this, you&apos;ll land in the call. Copy the invite from the side
            <br />
            panel — your guest joins, the waiting tile becomes their face.
          </div>
        </div>
      </main>
    </div>
  );
}
