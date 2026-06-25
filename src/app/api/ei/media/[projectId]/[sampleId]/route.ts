import { NextResponse } from "next/server";
import { getSession, studioMedia, studioFetch, traceSession } from "@/lib/ei-server";

export const runtime = "nodejs";

interface RawPayload {
  payload?: {
    sensors?: { name: string }[];
    values?: number[][] | number[];
    intervalMs?: number;
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string; sampleId: string }> },
) {
  const session = await getSession(req);
  traceSession(req, "media", session);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }

  const { projectId, sampleId } = await ctx.params;
  const pid = Number(projectId);
  const sid = Number(sampleId);
  if (pid !== session.projectId) {
    traceSession(req, "media:mismatch", session, { requestedProjectId: pid, sampleId: sid });
    return NextResponse.json({ success: false, error: "Project mismatch" }, { status: 403 });
  }

  const kind = new URL(req.url).searchParams.get("kind") || "image";

  // Time-series: synthesize a CSV (time + sensor columns) Label Studio can plot.
  if (kind === "timeseries") {
    const result = await studioFetch<RawPayload>(session, `/${pid}/raw-data/${sid}`);
    if (!result.ok || !result.data?.payload) {
      return NextResponse.json(
        { success: false, error: result.error || "No payload" },
        { status: result.status || 502 },
      );
    }
    const { sensors = [], values = [], intervalMs = 0 } = result.data.payload;
    const cols = sensors.length ? sensors.map((s) => s.name) : ["value"];
    const rows = (values as number[][]).map((row, i) => {
      const t = Math.round(i * intervalMs);
      const cells = Array.isArray(row) ? row : [row];
      return `${t},${cells.join(",")}`;
    });
    const csv = `time,${cols.join(",")}\n${rows.join("\n")}\n`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  // Image / audio: proxy the binary.
  // Note:
  // 1. For audio, the Edge Impulse API expects the required 'axisIx' query parameter (usually 0).
  // 2. We do not forward the browser's Range header to the Edge Impulse API
  //    because the Edge Impulse raw-data binary endpoints do not support Range requests
  //    and will return HTTP 400 Bad Request if a Range header is present.
  const path = kind === "audio" 
    ? `/${pid}/raw-data/${sid}/wav?axisIx=0` 
    : `/${pid}/raw-data/${sid}/image`;
  const upstream = await studioMedia(session, path);

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: `Edge Impulse media error (${upstream.status})` },
      { status: upstream.status || 502 },
    );
  }

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", kind === "audio" ? "audio/wav" : "image/png");
  }
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(upstream.body, { status: upstream.status, headers });
}
