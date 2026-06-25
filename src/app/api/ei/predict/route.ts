import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getSession, studioMedia } from "@/lib/ei-server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
// A cold (sleeping) Beam container can take some time to wake up.
// Give the proxy room before Vercel kills the function.
export const maxDuration = 300;

// The backend compiles and warms up the SAM 2.1 model during container startup.
// We keep the lazy /setup fallback in case of backend restarts or edge failures.
const SAM_SETUP_CONFIG =
  '<View><Image name="image" value="$image"/>' +
  '<KeyPointLabels name="KeyPointLabels" toName="image" smart="true"><Label value="x"/></KeyPointLabels>' +
  '<RectangleLabels name="RectangleLabels" toName="image" smart="true"><Label value="x"/></RectangleLabels>' +
  '<BrushLabels name="BrushLabels" toName="image" smart="true"><Label value="x"/></BrushLabels></View>';

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

/**
 * Make the sample image reachable to the (remote) SAM backend and return its URL
 * plus a cleanup callback.
 *
 * Deployed (and any setup with a remote backend): upload to Vercel Blob — a
 * temporary, unguessable, public URL the backend can fetch. The local `public/tmp`
 * trick can't work here (read-only FS on Vercel, and a remote host can't reach
 * localhost). Falls back to `public/tmp` only when no Blob token is configured,
 * i.e. a fully-local app + local backend.
 */
async function stageImage(
  bytes: Buffer,
  contentType: string,
  projectId: number,
  sampleId: number,
  req: Request,
): Promise<{ url: string; cleanup: () => Promise<void> }> {
  const ext = EXT_BY_TYPE[contentType.split(";")[0].trim()] ?? "jpg";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`sam-input/${projectId}-${sampleId}.${ext}`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return { url: blob.url, cleanup: () => del(blob.url).catch(() => {}) };
  }

  // Local fallback: serve from public/tmp at the app's own origin.
  const filename = `${projectId}_${sampleId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const tempDir = path.join(process.cwd(), "public", "tmp");
  const tempFilePath = path.join(tempDir, filename);
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(tempFilePath, bytes);

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  return {
    url: `${protocol}://${host}/tmp/${filename}`,
    cleanup: () => fs.unlink(tempFilePath).catch(() => {}),
  };
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }

  let body: { tasks?: { data?: { image?: string } }[]; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const tasks = body.tasks;
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ success: false, error: "No tasks provided" }, { status: 400 });
  }

  const task = tasks[0];
  const imageUrl = task.data?.image;
  if (!imageUrl) {
    return NextResponse.json({ success: false, error: "Task contains no image URL" }, { status: 400 });
  }

  // Parse sampleId and projectId from imageUrl: "/api/ei/media/123/456?kind=image"
  let projectId: number;
  let sampleId: number;
  try {
    const url = new URL(imageUrl, "http://localhost");
    const parts = url.pathname.split("/");
    projectId = Number(parts[4]);
    sampleId = Number(parts[5]);
  } catch {
    return NextResponse.json({ success: false, error: "Could not parse image URL parameters" }, { status: 400 });
  }

  if (isNaN(projectId) || isNaN(sampleId)) {
    return NextResponse.json({ success: false, error: "Invalid project ID or sample ID" }, { status: 400 });
  }

  // Retrieve image bytes from Edge Impulse (the backend can't auth to EI itself).
  let mediaResponse: Response;
  try {
    mediaResponse = await studioMedia(session, `/${projectId}/raw-data/${sampleId}/image`);
    if (!mediaResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Edge Impulse media error (${mediaResponse.status})` },
        { status: mediaResponse.status || 502 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to fetch image" },
      { status: 502 },
    );
  }

  const contentType = mediaResponse.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());

  let staged: { url: string; cleanup: () => Promise<void> };
  try {
    staged = await stageImage(bytes, contentType, projectId, sampleId, req);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Failed to stage image for the SAM backend: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  // Hand the backend a URL it can fetch, then forward the original prompt body.
  if (task.data) task.data.image = staged.url;

  const isWarmup = body.action === "warmup";
  const mlBackendUrl = process.env.SAM_BACKEND_URL || "http://localhost:8003/predict";
  const targetUrl = isWarmup ? mlBackendUrl.replace(/\/predict\/?$/, "/warmup") : mlBackendUrl;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Connection": "keep-alive"
  };
  if (process.env.SAM_BACKEND_AUTH) headers["Authorization"] = process.env.SAM_BACKEND_AUTH;

  const callBackend = () =>
    fetch(targetUrl, { method: "POST", headers, body: JSON.stringify(body) });

  try {
    let mlResponse = await callBackend();

    // Cold-start recovery: load the model via /setup, then retry once.
    if (!mlResponse.ok) {
      let errorText = await mlResponse.text();
      if (mlResponse.status >= 500 && /not loaded|setup\(\)/i.test(errorText)) {
        const setupUrl = mlBackendUrl.replace(/\/predict\/?$/, "/setup");
        await fetch(setupUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ project: "0", schema: SAM_SETUP_CONFIG }),
        }).catch(() => {});
        mlResponse = await callBackend();
        if (!mlResponse.ok) errorText = await mlResponse.text();
      }
      if (!mlResponse.ok) {
        return NextResponse.json(
          { success: false, error: `SAM backend error (${mlResponse.status}): ${errorText}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json(await mlResponse.json());
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Failed to connect to SAM backend: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  } finally {
    await staged.cleanup();
  }
}
