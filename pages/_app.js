import '@/styles/globals.css';
import Head from 'next/head';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>VidMeet — quiet, fast 2-person video.</title>
        <meta
          name="description"
          content="A low-latency, 2-person video call app. Generate a code, share an invite, talk."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#08090b" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </>
  );
}
