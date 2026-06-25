import { describe, it, expect } from "vitest";
import {
  mediaUrl,
  sampleToTask,
  boxesFromAnnotation,
  labelFromAnnotation,
} from "@/lib/mapping";
import type { EISample } from "@/lib/types";

function baseSample(overrides: Partial<EISample> = {}): EISample {
  return {
    id: 1,
    filename: "sample.jpg",
    label: "cat",
    category: "training",
    ...overrides,
  };
}

describe("mediaUrl", () => {
  it("builds a same-origin proxy URL with the kind query param", () => {
    expect(mediaUrl(3, 77, "image")).toBe("/api/ei/media/3/77?kind=image");
  });

  it("adds an opaque session token when provided", () => {
    expect(mediaUrl(3, 77, "image", "abc.def")).toBe(
      "/api/ei/media/3/77?kind=image&session=abc.def",
    );
  });
});

describe("sampleToTask", () => {
  it("uses the image data field for classify, detect and sam", () => {
    expect(sampleToTask(baseSample(), 2, "classify").data.image).toBe(mediaUrl(2, 1, "image"));
    expect(sampleToTask(baseSample(), 2, "detect").data.image).toBe(mediaUrl(2, 1, "image"));
    expect(sampleToTask(baseSample(), 2, "sam").data.image).toBe(mediaUrl(2, 1, "image"));
  });

  it("uses the audio data field for audio tasks", () => {
    const task = sampleToTask(baseSample({ filename: "s.wav" }), 2, "audio");
    expect(task.data).toEqual({ audio: mediaUrl(2, 1, "audio") });
  });

  it("uses the audio data field for transcribe tasks", () => {
    const task = sampleToTask(baseSample({ filename: "s.wav" }), 2, "transcribe");
    expect(task.data).toEqual({ audio: mediaUrl(2, 1, "audio") });
  });

  it("uses the timeseries data field for timeseries tasks", () => {
    const task = sampleToTask(baseSample(), 2, "timeseries");
    expect(task.data).toEqual({ timeseries: mediaUrl(2, 1, "timeseries") });
  });

  it("carries the sample id through and never sets predictions", () => {
    const task = sampleToTask(baseSample({ id: 555 }), 1, "classify");
    expect(task.id).toBe(555);
    expect(task.predictions).toBeUndefined();
  });

  describe("classify / audio seeding", () => {
    it("seeds the existing label as a choices annotation", () => {
      const task = sampleToTask(baseSample({ label: "dog" }), 1, "classify");
      expect(task.annotations).toEqual([
        {
          result: [
            { from_name: "label", to_name: "media", type: "choices", value: { choices: ["dog"] } },
          ],
        },
      ]);
    });

    it("seeds an empty annotation when the label is missing (so LS opens in edit mode)", () => {
      const task = sampleToTask(baseSample({ label: "" }), 1, "classify");
      expect(task.annotations).toEqual([{ result: [] }]);
    });

    it('treats the literal "unlabeled" as no label (seeds empty annotation)', () => {
      const task = sampleToTask(baseSample({ label: "unlabeled" }), 1, "audio");
      expect(task.annotations).toEqual([{ result: [] }]);
    });
  });

  describe("transcribe seeding", () => {
    it("seeds the existing label as a textarea annotation", () => {
      const task = sampleToTask(baseSample({ label: "hello world" }), 1, "transcribe");
      expect(task.annotations).toEqual([
        {
          result: [
            { from_name: "label", to_name: "media", type: "textarea", value: { text: ["hello world"] } },
          ],
        },
      ]);
    });
  });

  describe("detect seeding", () => {
    const detectSample = baseSample({
      boundingBoxes: [{ label: "face", x: 50, y: 100, width: 200, height: 150 }],
      imageDimensions: { width: 1000, height: 500 },
    });

    it("converts absolute pixel boxes to percentages of the image", () => {
      const task = sampleToTask(detectSample, 1, "detect");
      const result = (task.annotations as Array<{ result: Array<Record<string, unknown>> }>)[0].result[0];
      expect(result.type).toBe("rectanglelabels");
      expect(result.original_width).toBe(1000);
      expect(result.original_height).toBe(500);
      expect(result.value).toMatchObject({
        x: 5, // 50 / 1000 * 100
        y: 20, // 100 / 500 * 100
        width: 20, // 200 / 1000 * 100
        height: 30, // 150 / 500 * 100
        rotation: 0,
        rectanglelabels: ["face"],
      });
    });

    it("seeds an empty annotation when dimensions are missing (so LS opens in edit mode)", () => {
      const noDims = baseSample({
        boundingBoxes: [{ label: "face", x: 1, y: 1, width: 1, height: 1 }],
      });
      expect(sampleToTask(noDims, 1, "detect").annotations).toEqual([{ result: [] }]);
    });

    it("seeds an empty annotation when there are no boxes (so LS opens in edit mode)", () => {
      const noBoxes = baseSample({ imageDimensions: { width: 100, height: 100 } });
      expect(sampleToTask(noBoxes, 1, "detect").annotations).toEqual([{ result: [] }]);
    });
  });

  describe("sam seeding", () => {
    const samSample = baseSample({
      boundingBoxes: [{ label: "face", x: 50, y: 100, width: 200, height: 150 }],
      imageDimensions: { width: 1000, height: 500 },
    });

    it("converts absolute pixel boxes to percentages using RectangleLabels / image tags", () => {
      const task = sampleToTask(samSample, 1, "sam");
      const result = (task.annotations as Array<{ result: Array<Record<string, unknown>> }>)[0].result[0];
      expect(result.type).toBe("rectanglelabels");
      expect(result.from_name).toBe("RectangleLabels");
      expect(result.to_name).toBe("image");
      expect(result.original_width).toBe(1000);
      expect(result.original_height).toBe(500);
      expect(result.value).toMatchObject({
        x: 5,
        y: 20,
        width: 20,
        height: 30,
        rectanglelabels: ["face"],
      });
    });
  });
});

describe("boxesFromAnnotation", () => {
  it("converts percentage rectangles back to absolute pixels with rounding", () => {
    const annotation = {
      result: [
        {
          type: "rectanglelabels",
          original_width: 1000,
          original_height: 500,
          value: { x: 5, y: 20, width: 20, height: 30, rectanglelabels: ["face"] },
        },
      ],
    };
    expect(boxesFromAnnotation(annotation)).toEqual([
      { label: "face", x: 50, y: 100, width: 200, height: 150 },
    ]);
  });

  it("round-trips with sampleToTask (pixels -> percent -> pixels)", () => {
    const sample = baseSample({
      boundingBoxes: [{ label: "dog", x: 12, y: 34, width: 56, height: 78 }],
      imageDimensions: { width: 640, height: 480 },
    });
    const task = sampleToTask(sample, 1, "detect");
    const back = boxesFromAnnotation((task.annotations as unknown[])[0]);
    expect(back).toEqual(sample.boundingBoxes);
  });

  it("falls back to value.labels when rectanglelabels is absent", () => {
    const annotation = {
      result: [
        {
          type: "rectanglelabels",
          original_width: 200,
          original_height: 200,
          value: { x: 0, y: 0, width: 50, height: 50, labels: ["thing"] },
        },
      ],
    };
    expect(boxesFromAnnotation(annotation)[0].label).toBe("thing");
  });

  it("skips results that are not rectanglelabels", () => {
    const annotation = {
      result: [{ type: "choices", value: { choices: ["x"] } }],
    };
    expect(boxesFromAnnotation(annotation)).toEqual([]);
  });

  it("skips rectangles missing original dimensions", () => {
    const annotation = {
      result: [
        { type: "rectanglelabels", value: { x: 1, y: 1, width: 1, height: 1, rectanglelabels: ["a"] } },
      ],
    };
    expect(boxesFromAnnotation(annotation)).toEqual([]);
  });

  it("skips rectangles with no label", () => {
    const annotation = {
      result: [
        {
          type: "rectanglelabels",
          original_width: 100,
          original_height: 100,
          value: { x: 1, y: 1, width: 1, height: 1 },
        },
      ],
    };
    expect(boxesFromAnnotation(annotation)).toEqual([]);
  });

  it("returns an empty array for malformed input", () => {
    expect(boxesFromAnnotation(undefined)).toEqual([]);
    expect(boxesFromAnnotation({})).toEqual([]);
    expect(boxesFromAnnotation({ result: [] })).toEqual([]);
  });
});

describe("labelFromAnnotation", () => {
  it("returns the first chosen value from choices", () => {
    const annotation = { result: [{ type: "choices", value: { choices: ["cat", "dog"] } }] };
    expect(labelFromAnnotation(annotation)).toBe("cat");
  });

  it("falls back to labels when choices is absent", () => {
    const annotation = { result: [{ value: { labels: ["speech"] } }] };
    expect(labelFromAnnotation(annotation)).toBe("speech");
  });

  it("returns the text value from textarea results", () => {
    const annotation = { result: [{ type: "textarea", value: { text: ["hello world"] } }] };
    expect(labelFromAnnotation(annotation)).toBe("hello world");
  });

  it("returns null when no choice/label is present", () => {
    expect(labelFromAnnotation({ result: [{ value: {} }] })).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(labelFromAnnotation(undefined)).toBeNull();
    expect(labelFromAnnotation({})).toBeNull();
  });
});
