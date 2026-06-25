import { NextResponse } from "next/server";
import {
  sealSession,
  studioFetch,
  traceSession,
} from "@/lib/ei-server";
import type { EIProject, EISession } from "@/lib/types";

export const runtime = "nodejs";

interface ConnectBody {
  apiKey?: string;
  projectId?: number | string;
  studioHost?: string;
  ingestionHost?: string;
}

export async function POST(req: Request) {
  let body: ConnectBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  let projectId = Number(body.projectId);

  if (!apiKey || !/^ei_/.test(apiKey)) {
    return NextResponse.json(
      { success: false, error: "An Edge Impulse API key (starts with ei_) is required." },
      { status: 400 },
    );
  }

  const session: EISession = {
    apiKey,
    projectId,
    studioHost: body.studioHost?.trim() || undefined,
    ingestionHost: body.ingestionHost?.trim() || undefined,
  };
  traceSession(req, "session:connect:start", session, {
    requestedProjectId: projectId,
  });

  // A project API key is scoped to one project, so the ID is optional — when
  // it's missing, resolve it from the key itself.
  if (!Number.isFinite(projectId) || projectId < 1) {
    const list = await studioFetch<{ projects: EIProject[] }>(session, "/projects");
    const first = list.data?.projects?.[0];
    if (!list.ok || !first) {
      return NextResponse.json(
        {
          success: false,
          error:
            list.error ||
            "Couldn't determine a project from that API key. Add a project ID, or check the key.",
        },
        { status: list.status === 0 ? 502 : list.status || 401 },
      );
    }
    projectId = first.id;
    session.projectId = projectId;
  }

  // Validate the key + project by fetching project info.
  const result = await studioFetch<{ project: EIProject }>(session, `/${projectId}`);
  if (!result.ok) {
    const status = result.status === 0 ? 502 : result.status || 401;
    return NextResponse.json(
      {
        success: false,
        error:
          status === 401 || status === 403
            ? "Edge Impulse rejected that API key for this project."
            : result.error || "Could not reach Edge Impulse.",
      },
      { status },
    );
  }

  const res = NextResponse.json({
    success: true,
    project: result.data?.project,
    sessionToken: sealSession(session),
  });
  traceSession(req, "session:connect:done", session, {
    resolvedProjectId: result.data?.project?.id,
  });
  return res;
}

export async function DELETE() {
  // Stateless session tokens are kept in tab-scoped sessionStorage client-side.
  // Disconnect is therefore a client-side token discard.
  return NextResponse.json({ success: true });
}
