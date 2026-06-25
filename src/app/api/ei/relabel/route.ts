import { NextResponse } from "next/server";
import {
  expectedProjectMismatch,
  getSession,
  noStore,
  studioFetch,
  traceSession,
} from "@/lib/ei-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession(req);
  traceSession(req, "relabel", session);
  if (!session) {
    return noStore(NextResponse.json({ success: false, error: "Not connected" }, { status: 401 }));
  }
  const mismatch = expectedProjectMismatch(req, session);
  if (mismatch) {
    traceSession(req, "relabel:mismatch", session, mismatch);
    return noStore(NextResponse.json(
      {
        success: false,
        error: `Session project mismatch: workspace expected project ${mismatch.expected}, but the session token is for project ${mismatch.actual}.`,
      },
      { status: 409 },
    ));
  }

  let body: { sampleId?: number; newLabel?: string };
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }));
  }

  const sampleId = Number(body.sampleId);
  const newLabel = body.newLabel?.trim();
  if (!Number.isFinite(sampleId) || !newLabel) {
    return noStore(NextResponse.json(
      { success: false, error: "sampleId and newLabel are required" },
      { status: 400 },
    ));
  }

  const result = await studioFetch(
    session,
    `/${session.projectId}/raw-data/${sampleId}/rename`,
    { method: "POST", body: JSON.stringify({ newLabel }) },
  );
  if (!result.ok) {
    return noStore(NextResponse.json(
      { success: false, error: result.error },
      { status: result.status || 502 },
    ));
  }
  return noStore(NextResponse.json({ success: true }));
}
