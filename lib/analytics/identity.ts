import "server-only";
import { cookies } from "next/headers";

const ANON_COOKIE = "mik_anon_id";
const SESSION_COOKIE = "mik_session_id";
const SESSION_LAST_COOKIE = "mik_session_last";
const ANON_TTL_DAYS = 365;
const SESSION_GAP_MIN = 30;

function uuid() {
  // Cheap UUIDv4 — sufficient for an analytics id.
  // crypto.randomUUID is available in Node 18+ and the Edge runtime.
  // @ts-ignore
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Read the current visitor's identity, generating cookies on first contact
 * and rotating the session id after 30 minutes of inactivity. Cookies are
 * first-party and httpOnly = false so the client tracker can also read
 * them when sendBeacon-ing on pagehide.
 */
export function getVisitorIdentity() {
  const jar = cookies();
  let anon = jar.get(ANON_COOKIE)?.value;
  let session = jar.get(SESSION_COOKIE)?.value;
  const lastSeen = Number(jar.get(SESSION_LAST_COOKIE)?.value || 0);

  const now = Date.now();
  const gapMs = SESSION_GAP_MIN * 60 * 1000;

  if (!anon) {
    anon = uuid();
    jar.set(ANON_COOKIE, anon, {
      maxAge: ANON_TTL_DAYS * 24 * 60 * 60,
      sameSite: "lax",
      path: "/",
    });
  }

  if (!session || !lastSeen || now - lastSeen > gapMs) {
    session = uuid();
    jar.set(SESSION_COOKIE, session, {
      sameSite: "lax",
      path: "/",
    });
  }

  jar.set(SESSION_LAST_COOKIE, String(now), {
    sameSite: "lax",
    path: "/",
  });

  return { anonId: anon, sessionId: session };
}
