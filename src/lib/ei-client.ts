import type { EIBoundingBox, EICategory, EIProject, EIProjectMetadata, EISample } from "./types";

/** Thin client over our same-origin /api/ei/* proxy. */

const SESSION_STORAGE_KEY = "ei-session-token";

let debugSession = false;
let sessionToken: string | null = null;

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getEiSessionToken(): string | null {
  if (sessionToken) return sessionToken;
  sessionToken = storage()?.getItem(SESSION_STORAGE_KEY) ?? null;
  return sessionToken;
}

export function setEiSessionToken(token: string | null): void {
  sessionToken = token;
  const s = storage();
  if (!s) return;
  if (token) s.setItem(SESSION_STORAGE_KEY, token);
  else s.removeItem(SESSION_STORAGE_KEY);
}

export function setEiDebugSession(enabled: boolean): void {
  debugSession = enabled;
  if (enabled) {
    console.info("[ei-debug] client session tracing enabled");
  }
}

function debugLog(message: string, data?: Record<string, unknown>) {
  if (debugSession) console.info(`[ei-debug] ${message}`, data ?? {});
}

function requestOptions(expectedProjectId?: number, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  const token = getEiSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (expectedProjectId) headers.set("x-ei-project-id", String(expectedProjectId));
  if (debugSession) headers.set("x-ei-debug", "1");
  return {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  };
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Unexpected response (${res.status})`);
  }
  if (!res.ok) {
    const err = (body as { error?: string }).error;
    throw new Error(err || `Request failed (${res.status})`);
  }
  return body as T;
}

export interface ConnectInput {
  apiKey: string;
  /** Optional — resolved from the key server-side when omitted. */
  projectId?: number;
  studioHost?: string;
  ingestionHost?: string;
}

export async function connect(input: ConnectInput): Promise<{ project: EIProject; sessionToken: string }> {
  debugLog("connect:start", {
    requestedProjectId: input.projectId,
    studioHost: input.studioHost || "default",
  });
  const res = await fetch("/api/ei/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(debugSession ? { "x-ei-debug": "1" } : {}),
    },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const body = await jsonOrThrow<{ project: EIProject; sessionToken: string }>(res);
  setEiSessionToken(body.sessionToken);
  debugLog("connect:done", { projectId: body.project.id, projectName: body.project.name });
  return body;
}

export async function disconnect(): Promise<void> {
  await fetch("/api/ei/session", requestOptions(undefined, { method: "DELETE" }));
  setEiSessionToken(null);
}

export async function getProjects(): Promise<EIProject[]> {
  debugLog("getProjects:start");
  const res = await fetch("/api/ei/projects", requestOptions());
  const body = await jsonOrThrow<{ projects: EIProject[] }>(res);
  debugLog("getProjects:done", { projectIds: body.projects?.map((p) => p.id) ?? [] });
  return body.projects ?? [];
}

export async function getProjectMetadata(
  expectedProjectId?: number,
): Promise<{ metadata?: EIProjectMetadata }> {
  debugLog("getProjectMetadata:start", { expectedProjectId });
  const res = await fetch("/api/ei/project-metadata", requestOptions(expectedProjectId));
  return jsonOrThrow(res);
}

export interface SamplesQuery {
  category?: EICategory;
  labels?: string[];
  limit?: number;
  offset?: number;
  sampleId?: number;
  expectedProjectId?: number;
}

export async function getSamples(q: SamplesQuery): Promise<{ samples: EISample[]; totalCount: number }> {
  const params = new URLSearchParams();
  if (q.category) params.set("category", q.category);
  if (q.labels?.length) params.set("labels", q.labels.join(","));
  if (q.limit != null) params.set("limit", String(q.limit));
  if (q.offset != null) params.set("offset", String(q.offset));
  if (q.sampleId != null) params.set("sampleId", String(q.sampleId));
  debugLog("getSamples:start", {
    expectedProjectId: q.expectedProjectId,
    sampleId: q.sampleId,
    category: q.category,
    limit: q.limit,
    labels: q.labels,
  });
  const res = await fetch(`/api/ei/samples?${params}`, requestOptions(q.expectedProjectId));
  const body = await jsonOrThrow<{ samples: EISample[]; totalCount: number }>(res);
  debugLog("getSamples:done", {
    expectedProjectId: q.expectedProjectId,
    sampleCount: body.samples?.length ?? 0,
    firstSampleId: body.samples?.[0]?.id,
  });
  return body;
}

export async function relabel(sampleId: number, newLabel: string, expectedProjectId?: number): Promise<void> {
  const res = await fetch("/api/ei/relabel", requestOptions(expectedProjectId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sampleId, newLabel }),
  }));
  await jsonOrThrow(res);
}

export async function setBoundingBoxes(
  sampleId: number,
  boundingBoxes: EIBoundingBox[],
  expectedProjectId?: number,
): Promise<void> {
  const res = await fetch("/api/ei/bounding-boxes", requestOptions(expectedProjectId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sampleId, boundingBoxes }),
  }));
  await jsonOrThrow(res);
}
