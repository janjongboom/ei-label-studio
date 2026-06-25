import { NextResponse } from "next/server";
import {
  expectedProjectMismatch,
  getSession,
  studioFetch,
  traceSession,
} from "@/lib/ei-server";
import type { EIBoundingBox } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession(req);
  traceSession(req, "bounding-boxes", session);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }
  const mismatch = expectedProjectMismatch(req, session);
  if (mismatch) {
    traceSession(req, "bounding-boxes:mismatch", session, mismatch);
    return NextResponse.json(
      {
        success: false,
        error: `Session project mismatch: workspace expected project ${mismatch.expected}, but the session token is for project ${mismatch.actual}.`,
      },
      { status: 409 },
    );
  }

  let body: { sampleId?: number; boundingBoxes?: EIBoundingBox[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const sampleId = Number(body.sampleId);
  const boundingBoxes = body.boundingBoxes;
  if (!Number.isFinite(sampleId) || !Array.isArray(boundingBoxes)) {
    return NextResponse.json(
      { success: false, error: "sampleId and boundingBoxes are required" },
      { status: 400 },
    );
  }

  const result = await studioFetch(
    session,
    `/${session.projectId}/raw-data/${sampleId}/bounding-boxes`,
    { method: "POST", body: JSON.stringify({ boundingBoxes }) },
  );
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json({ success: true });
}
