import { NextResponse } from "next/server";
import {
  expectedProjectMismatch,
  getSession,
  studioFetch,
  traceSession,
} from "@/lib/ei-server";
import type { EIProjectMetadata, EISample } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession(req);
  traceSession(req, "samples", session);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not connected" }, { status: 401 });
  }
  const mismatch = expectedProjectMismatch(req, session);
  if (mismatch) {
    traceSession(req, "samples:mismatch", session, mismatch);
    return NextResponse.json(
      {
        success: false,
        error: `Session project mismatch: workspace expected project ${mismatch.expected}, but the session token is for project ${mismatch.actual}. Reconnect this tab or iframe.`,
      },
      { status: 409 },
    );
  }

  const url = new URL(req.url);
  const qp = new URLSearchParams();
  const category = url.searchParams.get("category");
  if (category) qp.set("category", category);
  const labels = url.searchParams.get("labels");
  if (labels) {
    const list = labels.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) {
      qp.set("labels", JSON.stringify(list));
    }
  }
  qp.set("limit", url.searchParams.get("limit") || "200");
  qp.set("offset", url.searchParams.get("offset") || "0");
  // We only need metadata for the queue + modality detection.
  qp.set("excludeSensors", "false");

  // If no specific labels filter is requested, and there are multiple classes in the project,
  // we fetch a balanced, interleaved mixture of samples from each class.
  if (!labels) {
    try {
      const metaResult = await studioFetch<{ metadata?: EIProjectMetadata }>(
        session,
        `/${session.projectId}/raw-data/project-metadata`,
      );
      if (metaResult.ok && metaResult.data?.metadata?.type === "classes") {
        const metadata = metaResult.data.metadata;
        let categoryData = metadata.all;
        if (category === "training" && metadata.training) categoryData = metadata.training;
        else if (category === "testing" && metadata.testing) categoryData = metadata.testing;
        else if (category === "anomaly" && metadata.anomaly) categoryData = metadata.anomaly;

        const activeLabels: string[] = categoryData?.labels
          ?.filter((l) => l.dataCount > 0)
          ?.map((l) => l.label) ?? [];


        if (activeLabels.length > 1) {
          const limitVal = Number(url.searchParams.get("limit") || "200");
          const offsetVal = Number(url.searchParams.get("offset") || "0");
          const limitPerClass = Math.ceil(limitVal / activeLabels.length);

          const promises = activeLabels.map(async (label) => {
            const classQp = new URLSearchParams();
            if (category) classQp.set("category", category);
            classQp.set("labels", JSON.stringify([label]));
            classQp.set("limit", String(limitPerClass));
            classQp.set("offset", String(offsetVal));
            classQp.set("excludeSensors", "false");

            const res = await studioFetch<{ samples: EISample[]; totalCount: number }>(
              session,
              `/${session.projectId}/raw-data?${classQp}`,
            );
            return {
              samples: res.data?.samples ?? [],
              totalCount: res.data?.totalCount ?? 0,
            };
          });

          const results = await Promise.all(promises);

          // The per-class fetches above return only *labeled* samples, which would
          // hide everything still to label. Pull unlabeled samples too and interleave
          // them in first, so the queue always surfaces what needs work.
          const unlabeledQp = new URLSearchParams();
          if (category) unlabeledQp.set("category", category);
          unlabeledQp.set("labels", JSON.stringify(["-", "", "unlabeled"]));
          unlabeledQp.set("limit", String(limitVal));
          unlabeledQp.set("offset", String(offsetVal));
          unlabeledQp.set("excludeSensors", "false");
          const unlabeledRes = await studioFetch<{ samples: EISample[] }>(
            session,
            `/${session.projectId}/raw-data?${unlabeledQp}`,
          );

          const unlabeledSamples = (unlabeledRes.data?.samples ?? []).filter(
            (s) => !s.label || s.label === "unlabeled" || s.label === "-",
          );

          const interleaved: EISample[] = [];
          const lists = [unlabeledSamples, ...results.map((r) => r.samples)];
          const maxLen = Math.max(...lists.map((l) => l.length));

          for (let i = 0; i < maxLen; i++) {
            for (const list of lists) {
              if (i < list.length) {
                interleaved.push(list[i]);
              }
            }
          }

          const finalSamples = interleaved.slice(0, limitVal);
          const totalCount =
            results.reduce((acc, r) => acc + r.totalCount, 0) + unlabeledSamples.length;

          return NextResponse.json({
            success: true,
            samples: finalSamples,
            totalCount,
          });
        }
      }
    } catch {
      // Fallback to default single query on any error fetching metadata
    }
  }

  const result = await studioFetch<{ samples: EISample[]; totalCount: number }>(
    session,
    `/${session.projectId}/raw-data?${qp}`,
  );
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status || 502 },
    );
  }
  return NextResponse.json({
    success: true,
    samples: result.data?.samples ?? [],
    totalCount: result.data?.totalCount ?? 0,
  });
}
