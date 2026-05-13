import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Wordmark from '@/components/Wordmark';
import { isValidRoomId, safeName } from '@/lib/utils';

// VideoCall depends on `window` / WebRTC APIs — never SSR.
const VideoCall = dynamic(() => import('@/components/VideoCall'), {
  ssr: false,
  loading: () => <CallLoading />,
});

export default function CallRoom() {
  const router = useRouter();

  if (!router.isReady) {
    return <CallLoading />;
  }

  const { roomId, host, name } = router.query;

  if (typeof roomId !== 'string' || !isValidRoomId(roomId)) {
    return (
      <Shell>
        <div className="card max-w-lg w-full text-center">
          <div className="font-body text-xs tracking-[0.2em] text-signal mb-2">// 404</div>
          <h2 className="font-display text-4xl mb-3">No such room.</h2>
          <p className="text-bone-200/70 mb-6">The joining code looks invalid.</p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            Home
          </button>
        </div>
      </Shell>
    );
  }

  const isHost = host === '1' || host === 'true' || host === 'yes';
  const userName = typeof name === 'string' ? safeName(name) : 'Guest';

  return <VideoCall roomId={roomId} isHost={isHost} userName={userName} />;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 md:px-8 py-5 border-b border-bone-100/8">
        <Wordmark />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">{children}</main>
    </div>
  );
}

function CallLoading() {
  return (
    <Shell>
      <div className="text-center">
        <div className="inline-flex items-center gap-3 px-5 py-3 border border-bone-100/12 rounded-full">
          <span className="live-dot" />
          <span className="font-body text-xs tracking-[0.2em] text-bone-200/70">BOOTING</span>
        </div>
        <h2 className="font-display text-4xl mt-6">Warming up the line…</h2>
      </div>
    </Shell>
  );
}
