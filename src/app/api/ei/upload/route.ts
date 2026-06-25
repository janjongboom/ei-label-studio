import { NextResponse } from "next/server";
import { getSession, ingestionBase } from "@/lib/ei-server";

export const runtime = "nodejs";

const CATEGORIES = new Set(["training", "testing", "anomaly"]);

/**
 * Import-and-label flow: upload a file to the EI Ingestion API with a label.
 * Expects multipart/form-data: file, label, category.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  const label = (form.get("label") as string | null)?.trim();
  const category = ((form.get("category") as string | null) || "training").trim();

  if (!(file instanceof Blob) || typeof (file as File).name !== "string") {
    return NextResponse.json({ success: false, error: "A file is required" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ success: false, error: "A label is required" }, { status: 400 });
  }
  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
  }

  const f = file as File;
  const buf = await f.arrayBuffer();
  const upstream = await fetch(`${ingestionBase(session)}/${category}/data`, {
    method: "POST",
    headers: {
      "x-api-key": session.apiKey,
      "x-label": label,
      "x-file-name": f.name,
      "Content-Type": f.type || "application/octet-stream",
    },
    body: buf,
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: text || `Ingestion error (${upstream.status})` },
      { status: upstream.status || 502 },
    );
  }
  return NextResponse.json({ success: true });
}
