import type { EICategory, LabelTask, WorkMode } from "./types";

/**
 * Deep-link presets, in the spirit of synthetic-data-studio's url-parameters.
 * Parsed ONCE at load — not state-sync. Invalid values are silently dropped,
 * booleans accept several spellings, enums are case-insensitive.
 */
export interface UrlPreset {
  apiKey?: string;
  projectId?: number;
  sampleId?: number;
  category?: EICategory;
  labels?: string[];
  task?: LabelTask;
  mode?: WorkMode;
  autoAdvance?: boolean;
  /** Turn on Label Studio's Auto-Annotation (interactive SAM) toggle. */
  autoAnnotate?: boolean;
  /** Auto-accept SAM suggestions instead of confirming each one. */
  autoAccept?: boolean;
  limit?: number;
  offset?: number;
  theme?: "dark" | "light" | "unicorn";
  embed?: boolean;
  /** Print client/server session traces for debugging iframe/session bugs. */
  debugSession?: boolean;
  studioHost?: string;
  ingestionHost?: string;
}

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

function bool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return undefined;
}

function int(v: string | null, min = -Infinity, max = Infinity): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function enumv<T extends string>(v: string | null, allowed: readonly T[]): T | undefined {
  if (v == null) return undefined;
  const s = v.trim().toLowerCase();
  return allowed.find((a) => a === s);
}

/** Parse a URLSearchParams (or query string) into a preset. Never throws. */
export function parsePreset(input: URLSearchParams | string): UrlPreset {
  const p = typeof input === "string" ? new URLSearchParams(input) : input;
  const preset: UrlPreset = {};

  const apiKey = p.get("apiKey");
  if (apiKey && /^ei_/.test(apiKey.trim())) preset.apiKey = apiKey.trim();

  const projectId = int(p.get("project") ?? p.get("eiProject"), 1);
  if (projectId !== undefined) preset.projectId = projectId;

  const sampleId = int(p.get("sampleId"), 1);
  if (sampleId !== undefined) preset.sampleId = sampleId;

  const category = enumv(p.get("category"), ["training", "testing", "anomaly"] as const);
  if (category) preset.category = category;

  const labels = p.get("labels");
  if (labels) {
    const list = labels.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) preset.labels = list;
  }

  const task = enumv(p.get("task"), ["classify", "detect", "audio", "timeseries", "sam", "transcribe"] as const);
  if (task) preset.task = task;

  const mode = enumv(p.get("mode"), ["relabel", "import"] as const);
  if (mode) preset.mode = mode;

  const autoAdvance = bool(p.get("autoAdvance"));
  if (autoAdvance !== undefined) preset.autoAdvance = autoAdvance;

  const autoAnnotate = bool(p.get("autoAnnotate"));
  if (autoAnnotate !== undefined) preset.autoAnnotate = autoAnnotate;

  const autoAccept = bool(p.get("autoAccept"));
  if (autoAccept !== undefined) preset.autoAccept = autoAccept;

  const limit = int(p.get("limit"), 1, 1000);
  if (limit !== undefined) preset.limit = limit;

  const offset = int(p.get("offset"), 0);
  if (offset !== undefined) preset.offset = offset;

  const theme = enumv(p.get("theme"), ["dark", "light", "unicorn"] as const);
  if (theme) preset.theme = theme;

  const embed = bool(p.get("embed"));
  if (embed !== undefined) preset.embed = embed;

  const debugSession = bool(p.get("debugSession") ?? p.get("debug"));
  if (debugSession !== undefined) preset.debugSession = debugSession;

  const studioHost = p.get("studioHost");
  if (studioHost) preset.studioHost = studioHost.trim();

  const ingestionHost = p.get("ingestionHost");
  if (ingestionHost) preset.ingestionHost = ingestionHost.trim();

  return preset;
}

/**
 * Resolves the query parameters for the current page, merging them with the
 * parent window's query parameters if the page is loaded inside an iframe.
 */
export function getIframeQueryParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const params = new URLSearchParams(window.location.search);

  if (window.self !== window.top) {
    try {
      if (window.parent && window.parent.location) {
        const parentParams = new URLSearchParams(window.parent.location.search);
        for (const [key, value] of parentParams.entries()) {
          params.set(key, value);
        }
      }
    } catch (e) {
      // Ignore cross-origin DOMException when parent is on a different origin
    }
  }

  return params;
}
