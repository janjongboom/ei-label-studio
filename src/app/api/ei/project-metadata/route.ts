import { NextResponse } from "next/server";
import {
  expectedProjectMismatch,
  getSession,
  studioFetch,
  traceSession,
} from "@/lib/ei-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession(req);
  traceSession(req, "project-metadata", session);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }
  const mismatch = expectedProjectMismatch(req, session);
  if (mismatch) {
    traceSession(req, "project-metadata:mismatch", session, mismatch);
    return NextResponse.json(
      {
        success: false,
        error: `Session project mismatch: workspace expected project ${mismatch.expected}, but the session token is for project ${mismatch.actual}.`,
      },
      { status: 409 },
    );
  }

  const result = await studioFetch<{ metadata?: unknown }>(
    session,
    `/${session.projectId}/raw-data/project-metadata`,
  );
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json({
    success: true,
    metadata: result.data?.metadata,
  });
}
