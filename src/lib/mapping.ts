import type { EIBoundingBox, EISample, LabelTask, LSTask, LSPrediction, LSResult } from "./types";

/** Build the media proxy URL Label Studio fetches (same-origin, token-authed). */
export function mediaUrl(
  projectId: number,
  sampleId: number,
  kind: string,
  sessionToken?: string | null,
): string {
  const params = new URLSearchParams({ kind });
  if (sessionToken) params.set("session", sessionToken);
  return `/api/ei/media/${projectId}/${sampleId}?${params}`;
}

/**
 * Convert an EI sample into a Label Studio task. The current EI label is
 * attached as a `prediction` so the labeler sees and can confirm/correct it.
 */
export function sampleToTask(
  sample: EISample,
  projectId: number,
  task: LabelTask,
  sessionToken?: string | null,
): LSTask {
  const data: Record<string, string> = {};
  let predictions: LSPrediction[] | undefined;
  let annotations: unknown[] = [];

  if (task === "classify" || task === "detect" || task === "sam") {
    data.image = mediaUrl(projectId, sample.id, "image", sessionToken);
  } else if (task === "audio" || task === "transcribe") {
    data.audio = mediaUrl(projectId, sample.id, "audio", sessionToken);
  } else {
    data.timeseries = mediaUrl(projectId, sample.id, "timeseries", sessionToken);
  }

  const hasLabel = sample.label && sample.label !== "unlabeled" && sample.label !== "-";

  if (task === "classify" || task === "audio") {
    // Seed the existing label as an editable annotation so the sample opens
    // ready to confirm or correct, with a visible Submit/Update button.
    if (hasLabel) {
      const result: LSResult[] = [
        { from_name: "label", to_name: "media", type: "choices", value: { choices: [sample.label] } },
      ];
      annotations = [{ result }];
    }
  } else if (task === "transcribe") {
    if (hasLabel) {
      const result: LSResult[] = [
        { from_name: "label", to_name: "media", type: "textarea", value: { text: [sample.label] } },
      ];
      annotations = [{ result }];
    }
  } else if (task === "detect") {
    // EI stores boxes as ABSOLUTE pixels; Label Studio expects PERCENTAGES of
    // the image, with original_width/height as the reference. Seed them as an
    // editable annotation so they render and can be adjusted.
    const dims = sample.imageDimensions;
    if (sample.boundingBoxes?.length && dims?.width && dims?.height) {
      const result: LSResult[] = sample.boundingBoxes.map((b) => ({
        from_name: "label",
        to_name: "media",
        type: "rectanglelabels",
        original_width: dims.width,
        original_height: dims.height,
        image_rotation: 0,
        value: {
          x: (b.x / dims.width) * 100,
          y: (b.y / dims.height) * 100,
          width: (b.width / dims.width) * 100,
          height: (b.height / dims.height) * 100,
          rotation: 0,
          rectanglelabels: [b.label],
        },
      }));
      annotations = [{ result }];
    }
  } else if (task === "sam") {
    // Seed existing bounding boxes for the SAM template (where the tags
    // are named RectangleLabels and target the 'image' canvas element)
    const dims = sample.imageDimensions;
    if (sample.boundingBoxes?.length && dims?.width && dims?.height) {
      const result: LSResult[] = sample.boundingBoxes.map((b) => ({
        from_name: "RectangleLabels",
        to_name: "image",
        type: "rectanglelabels",
        original_width: dims.width,
        original_height: dims.height,
        image_rotation: 0,
        value: {
          x: (b.x / dims.width) * 100,
          y: (b.y / dims.height) * 100,
          width: (b.width / dims.width) * 100,
          height: (b.height / dims.height) * 100,
          rotation: 0,
          rectanglelabels: [b.label],
        },
      }));
      annotations = [{ result }];
    }
  }

  // Label Studio treats an empty `annotations` array as "nothing left to
  // annotate" and shows a "No more annotations" completion screen.  Always
  // seed at least one annotation (with an empty result) so unlabeled samples
  // open in edit mode, ready for the user to start labeling.
  if (annotations.length === 0) {
    annotations = [{ result: [] }];
  }

  return { id: sample.id, data, predictions, annotations };
}

/**
 * Convert a submitted Label Studio rectangle annotation back into EI bounding
 * boxes (absolute pixels), using each result's original_width/height.
 */
export function boxesFromAnnotation(
  annotation: unknown,
  dims?: { width: number; height: number },
): EIBoundingBox[] {
  const a = annotation as {
    result?: Array<{
      type?: string;
      original_width?: number;
      original_height?: number;
      value?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        rectanglelabels?: string[];
        labels?: string[];
      };
    }>;
  };
  if (!a?.result) return [];
  const boxes: EIBoundingBox[] = [];
  for (const r of a.result) {
    if (r.type !== "rectanglelabels" || !r.value) continue;
    const ow = r.original_width ?? dims?.width ?? 0;
    const oh = r.original_height ?? dims?.height ?? 0;
    if (!ow || !oh) continue;
    const label = r.value.rectanglelabels?.[0] ?? r.value.labels?.[0];
    if (!label) continue;
    boxes.push({
      label,
      x: Math.round(((r.value.x ?? 0) / 100) * ow),
      y: Math.round(((r.value.y ?? 0) / 100) * oh),
      width: Math.round(((r.value.width ?? 0) / 100) * ow),
      height: Math.round(((r.value.height ?? 0) / 100) * oh),
    });
  }
  return boxes;
}

/**
 * Extract the chosen single-class label from a submitted Label Studio
 * annotation (classify / audio templates).
 */
export function labelFromAnnotation(annotation: unknown): string | null {
  const a = annotation as {
    result?: Array<{
      type?: string;
      value?: {
        choices?: string[];
        labels?: string[];
        text?: string[];
      };
    }>;
  };
  if (!a?.result) return null;
  for (const r of a.result) {
    if (r.value?.choices?.length) return r.value.choices[0];
    if (r.value?.labels?.length) return r.value.labels[0];
    if (r.value?.text?.length) return r.value.text[0];
  }
  return null;
}
