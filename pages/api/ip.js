// pages/api/ip.js
// Returns the requester's public-facing IP, optional geo, and headers used for invite metadata.
// Tries Vercel geo headers first (free, instant). Falls back to a server-side geo lookup
// when those aren't present (e.g. local dev or non-Vercel hosts). The fallback happens
// server-side on purpose so the browser never makes a cross-origin call.

async function lookupGeo(ip) {
  if (
    !ip ||
    ip === 'Unknown' ||
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.')
  ) {
    return null;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    // ipwho.is is keyless, generous, and works fine from a server.
    const r = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.success === false) return null;
    return {
      city: j.city || null,
      region: j.region || null,
      country: j.country || null,
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const remote = req.socket?.remoteAddress || null;

    let ip = 'Unknown';
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      ip = forwarded.split(',')[0].trim();
    } else if (typeof realIp === 'string') {
      ip = realIp;
    } else if (typeof remote === 'string') {
      ip = remote;
    }

    // Vercel geolocation headers (when deployed on Vercel)
    let country = req.headers['x-vercel-ip-country'] || null;
    let region = req.headers['x-vercel-ip-country-region'] || null;
    let city = req.headers['x-vercel-ip-city']
      ? decodeURIComponent(req.headers['x-vercel-ip-city'])
      : null;

    // Fallback server-side lookup if Vercel didn't provide anything
    if (!city && !country) {
      const geo = await lookupGeo(ip);
      if (geo) {
        city = geo.city;
        region = geo.region;
        country = geo.country;
      }
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      ip,
      city,
      region,
      country,
      userAgent: req.headers['user-agent'] || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(200).json({
      ip: 'Unknown',
      city: null,
      region: null,
      country: null,
      error: err?.message || 'unknown',
    });
  }
}
