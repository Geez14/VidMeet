import '@/styles/globals.css';
import Head from 'next/head';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from "@vercel/speed-insights/next"

export default function App({ Component, pageProps }) {
  const siteTitle = 'VidMeet — quiet, fast 2-person video.';
  const siteDescription =
    'A low-latency, 2-person video call app. Generate a code, share an invite, talk.';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  return (
    <>
      <Head>
        <title>{siteTitle}</title>
        <meta name="description" content={siteDescription} />
        <meta name="keywords" content="video call, peer-to-peer, WebRTC, low latency, 2-person, VidMeet" />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="VidMeet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#08090b" />
        <meta property="og:title" content={siteTitle} />
        <meta property="og:description" content={siteDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="VidMeet" />
        <meta property="og:locale" content="en_US" />
        {siteUrl ? <meta property="og:url" content={siteUrl} /> : null}
        {siteUrl ? <link rel="canonical" href={siteUrl} /> : null}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={siteTitle} />
        <meta name="twitter:description" content={siteDescription} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
      <Analytics />
    </>
  );
}
