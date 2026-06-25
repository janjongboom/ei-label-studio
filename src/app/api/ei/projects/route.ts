import { NextResponse } from "next/server";
import { getSession, studioFetch, traceSession } from "@/lib/ei-server";
import type { EIProject } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession(req);
  traceSession(req, "projects", session);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }

  // With an API key, EI returns only the key's own project. Fall back to the
  // single project-info call so the picker always has at least that one.
  const list = await studioFetch<{ projects: EIProject[] }>(session, "/projects");
  if (list.ok && list.data?.projects?.length) {
    return NextResponse.json({ success: true, projects: list.data.projects });
  }

  const info = await studioFetch<{ project: EIProject }>(session, `/${session.projectId}`);
  if (info.ok && info.data?.project) {
    return NextResponse.json({ success: true, projects: [info.data.project] });
  }

  return NextResponse.json(
    { success: false, error: list.error || info.error || "Could not list projects" },
    { status: 502 },
  );
}
