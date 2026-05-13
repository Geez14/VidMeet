import Link from 'next/link';

export default function Wordmark({ className = '' }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 group ${className}`}
      aria-label="VidMeet home"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="3"
          width="13"
          height="16"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M14 8.5L20.5 5V17L14 13.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="7.5" cy="11" r="1.4" fill="#ff4d2e" />
      </svg>
      <span className="font-display text-xl tracking-tight">
        VidMeet<span className="text-signal">.</span>
      </span>
    </Link>
  );
}
