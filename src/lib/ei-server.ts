import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { EISession } from "./types";

const DEFAULT_STUDIO = "https://studio.edgeimpulse.com";
const DEFAULT_INGESTION = "https://ingestion.edgeimpulse.com";
const SESSION_TOKEN_VERSION = "v1";
const SESSION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/** Normalize a user-supplied host into an absolute origin (no trailing slash). */
export function normalizeHost(host: string | undefined, fallback: string): string {
  if (!host) return fallback;
  let h = host.trim();
  if (!h) return fallback;
  if (!/^https?:\/\//i.test(h)) h = `https://${h}`;
  return h.replace(/\/+$/, "");
}

export function studioBase(session: EISession): string {
  return `${normalizeHost(session.studioHost, DEFAULT_STUDIO)}/v1/api`;
}

export function ingestionBase(session: EISession): string {
  return `${normalizeHost(session.ingestionHost, DEFAULT_INGESTION)}/api`;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromBase64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function sessionSecret(): string {
  const secret =
    process.env.EI_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "ei-label-studio-local-dev-session-secret";
  throw new Error("Set EI_SESSION_SECRET to encrypt Edge Impulse session tokens.");
}

function sessionKey(): Buffer {
  return createHash("sha256").update(sessionSecret()).digest();
}

interface TokenPayload extends EISession {
  exp: number;
}

export function sealSession(session: EISession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const payload: TokenPayload = {
    ...session,
    exp: Date.now() + SESSION_TOKEN_TTL_MS,
  };
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [SESSION_TOKEN_VERSION, base64url(iv), base64url(tag), base64url(encrypted)].join(".");
}

export function openSessionToken(token: string): EISession | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== SESSION_TOKEN_VERSION) return null;
  try {
    const [, ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), fromBase64url(ivRaw));
    decipher.setAuthTag(fromBase64url(tagRaw));
    const text = Buffer.concat([
      decipher.update(fromBase64url(encryptedRaw)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(text) as TokenPayload;
    if (!parsed.apiKey || !parsed.projectId) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
    const { apiKey, projectId, studioHost, ingestionHost } = parsed;
    return { apiKey, projectId, studioHost, ingestionHost };
  } catch {
    return null;
  }
}

export function sessionTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const header = req.headers.get("x-ei-session-token") || req.headers.get("x-ei-session");
  if (header) return header.trim();
  try {
    return new URL(req.url).searchParams.get("session");
  } catch {
    return null;
  }
}

/** Read and decrypt the per-instance session token. Returns null when not connected. */
export async function getSession(req: Request): Promise<EISession | null> {
  const token = sessionTokenFromRequest(req);
  return token ? openSessionToken(token) : null;
}

function requestDebugEnabled(req: Request): boolean {
  if (req.headers.get("x-ei-debug") === "1") return true;
  try {
    const params = new URL(req.url).searchParams;
    return params.get("debug") === "1" || params.get("debugSession") === "1";
  } catch {
    return false;
  }
}

export function expectedProjectId(req: Request): number | null {
  const raw = req.headers.get("x-ei-project-id");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function expectedProjectMismatch(req: Request, session: EISession) {
  const expected = expectedProjectId(req);
  if (!expected || expected === session.projectId) return null;
  return { expected, actual: session.projectId };
}

export function traceSession(
  req: Request,
  route: string,
  session: EISession | null,
  extra: Record<string, unknown> = {},
) {
  if (!requestDebugEnabled(req)) return;
  const url = new URL(req.url);
  console.info(`[ei-debug] ${route}`, {
    method: req.method,
    path: url.pathname,
    expectedProjectId: expectedProjectId(req),
    sessionProjectId: session?.projectId ?? null,
    studioHost: session?.studioHost || "default",
    hasSession: !!session,
    ...extra,
  });
}

export interface StudioFetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Call a Studio API path (relative to /v1/api) with the session's api key.
 * Parses JSON and checks the EI `success` envelope.
 */
export async function studioFetch<T = unknown>(
  session: EISession,
  path: string,
  init?: RequestInit,
): Promise<StudioFetchResult<T>> {
  const url = `${studioBase(session)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "x-api-key": session.apiKey,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, status: res.status, error: `Non-JSON response (${res.status})` };
  }

  const envelope = json as { success?: boolean; error?: string };
  if (!res.ok || envelope.success === false) {
    return {
      ok: false,
      status: res.status,
      error: envelope.error || `Edge Impulse API error (${res.status})`,
    };
  }
  return { ok: true, status: res.status, data: json as T };
}

/** Fetch raw binary media (image/wav/raw) and stream it back to the caller. */
export async function studioMedia(
  session: EISession,
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const url = `${studioBase(session)}${path}`;
  return fetch(url, {
    headers: { "x-api-key": session.apiKey, ...(extraHeaders ?? {}) },
    cache: "no-store",
  });
}
