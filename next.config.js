/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode intentionally OFF.
  //
  // React StrictMode double-invokes effects in development to surface bugs in
  // idempotency-sensitive code. The trouble is that PeerJS peer registration
  // is fundamentally NOT idempotent: each `new Peer(id)` claims that id on the
  // public broker, and the broker holds the registration for ~60 seconds after
  // disconnect. With strict mode on, every component mount in dev does:
  //   1) effect runs → peer registers id X
  //   2) cleanup runs → peer destroyed (broker grace timer starts)
  //   3) effect runs AGAIN → tries to register id X → `unavailable-id` (broker
  //      still holds it from step 1)
  //
  // This makes every dev page-load fail with "That meeting code is already in
  // use", which is both wrong and confusing. Production builds don't have this
  // problem (no double-invoke), but dev is what people actually use to iterate.
  // Disabling strict mode is the pragmatic fix.
  reactStrictMode: false,
  // Allow media devices (camera/mic) headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self)',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
