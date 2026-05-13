// lib/utils.js

// Generate a collision-resistant room id. Avoid ambiguous chars (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_PREFIX = 'vm-';
const BODY_LEN = 10;

export function generateRoomId() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(BODY_LEN);
    window.crypto.getRandomValues(bytes);
    let id = '';
    for (let i = 0; i < bytes.length; i++) {
      id += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return ROOM_PREFIX + id;
  }
  let id = '';
  for (let i = 0; i < BODY_LEN; i++) {
    id += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return ROOM_PREFIX + id;
}
export function normalizeRoomCode(input) {
  if (!input) return '';
  // Drop EVERYTHING that isn't alphanumeric — spaces, dashes, slashes, the lot.
  // This is the body the user typed; we'll re-attach our own 'vm-' prefix.
  let cleaned = input.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Strip an optional 'VM' prefix the user may have typed or pasted.
  if (cleaned.startsWith('VM')) cleaned = cleaned.slice(2);
  if (!cleaned) return '';
  return 'vm-' + cleaned;
}

/**
 * Format raw user input into a friendly display form for the joining-code field.
 * Strips junk, removes any 'VM' prefix, uppercases, and re-inserts one hyphen
 * between the two halves of the body. Returns both the display string and the
 * normalized id so the caller can submit without re-cleaning.
 */
export function formatJoinInput(raw) {
  if (!raw) return { display: '', normalized: '' };
  let body = raw.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (body.startsWith('VM')) body = body.slice(2);
  body = body.slice(0, 10); // cap at our generator's body length
  const groups = body.match(/.{1,5}/g);
  const display = groups ? groups.join('-') : '';
  const normalized = body ? 'vm-' + body : '';
  return { display, normalized };
}

export function formatRoomCodeForDisplay(roomId) {
  if (!roomId) return '';
  const code = roomId.replace(/^vm-/i, '');
  const groups = code.match(/.{1,5}/g);
  return groups ? groups.join('-') : code;
}

export function isValidRoomId(roomId) {
  // 10 alphanumeric chars after the prefix — matches the BODY_LEN our
  // generator produces. Codes shorter or longer are not VidMeet codes.
  return typeof roomId === 'string' && /^vm-[A-Z0-9]{10}$/i.test(roomId);
}

export async function fetchMeetingInfo() {
  // Default fallback values
  const fallback = {
    ip: 'Unknown',
    city: null,
    region: null,
    country: null,
  };

  try {
    // Single source: our own /api/ip route. It does any external geo lookup
    // server-side so the browser never makes a cross-origin call.
    const res = await fetch('/api/ip', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return {
        ip: data.ip || fallback.ip,
        city: data.city || null,
        region: data.region || null,
        country: data.country || null,
      };
    }
  } catch {
    // network blocked / offline — return fallback silently
  }

  return fallback;
}

export function buildJoinUrl(roomId) {
  if (typeof window === 'undefined') return `/join?code=${encodeURIComponent(roomId)}`;
  const base = `${window.location.protocol}//${window.location.host}`;
  return `${base}/join?code=${encodeURIComponent(roomId)}`;
}

export function buildInviteText({ roomId, hostName, hostInfo, joinUrl }) {
  const code = formatRoomCodeForDisplay(roomId);
  const location = [hostInfo?.city, hostInfo?.region, hostInfo?.country]
    .filter(Boolean)
    .join(', ') || 'Unknown';
  const when = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return [
    'You are invited to a VidMeet video call.',
    '',
    `Host:           ${hostName || 'Anonymous'}`,
    `Joining Code:   ${code}`,
    `Direct Link:    ${joinUrl}`,
    '',
    'Meeting origin',
    `  Location:     ${location}`,
    `  Network IP:   ${hostInfo?.ip || 'Unknown'}`,
    `  Created:      ${when}`,
    '',
    'Open the direct link, or visit VidMeet and enter the joining code.',
    '— VidMeet',
  ].join('\n');
}

export function safeName(name) {
  if (!name) return 'Guest';
  const trimmed = name.toString().trim().slice(0, 40);
  return trimmed || 'Guest';
}

// ---- Per-tab "this room is over" flag ----
// When the host explicitly ends a meeting, we destroy the peer (which releases
// the broker registration — every OTHER device that tries to dial will now get
// `peer-unavailable` and see "Meeting not found"). This flag is the local
// counterpart: it prevents THIS tab from sneaking back in via the back button
// or by re-opening the URL, since the broker holds stale ids for ~60s.
const EXPIRED_ROOMS_KEY = 'vm:expired-rooms';
const MAX_REMEMBERED = 50;

export function markRoomExpired(roomId) {
  if (typeof window === 'undefined' || !roomId) return;
  try {
    const raw = window.sessionStorage.getItem(EXPIRED_ROOMS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    if (!list.includes(roomId)) list.push(roomId);
    const trimmed = list.slice(-MAX_REMEMBERED);
    window.sessionStorage.setItem(EXPIRED_ROOMS_KEY, JSON.stringify(trimmed));
  } catch {
    /* sessionStorage can throw in private mode / disabled storage */
  }
}

export function isRoomExpired(roomId) {
  if (typeof window === 'undefined' || !roomId) return false;
  try {
    const raw = window.sessionStorage.getItem(EXPIRED_ROOMS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes(roomId);
  } catch {
    return false;
  }
}

export function debounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
