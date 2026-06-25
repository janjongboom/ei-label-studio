import { describe, it, expect } from "vitest";
import { parsePreset } from "@/lib/url-params";

describe("parsePreset", () => {
  it("returns an empty preset for an empty query", () => {
    expect(parsePreset("")).toEqual({});
  });

  it("accepts either a query string or a URLSearchParams instance", () => {
    const fromString = parsePreset("project=7");
    const fromParams = parsePreset(new URLSearchParams("project=7"));
    expect(fromString).toEqual({ projectId: 7 });
    expect(fromParams).toEqual({ projectId: 7 });
  });

  describe("apiKey", () => {
    it("keeps a key with the ei_ prefix and trims it", () => {
      expect(parsePreset("apiKey=%20ei_abc123%20")).toEqual({ apiKey: "ei_abc123" });
    });

    it("drops a key without the ei_ prefix", () => {
      expect(parsePreset("apiKey=nope123")).toEqual({});
    });
  });

  describe("projectId", () => {
    it("parses the `project` param", () => {
      expect(parsePreset("project=42").projectId).toBe(42);
    });

    it("falls back to the `eiProject` alias", () => {
      expect(parsePreset("eiProject=99").projectId).toBe(99);
    });

    it("prefers `project` over `eiProject` when both are present", () => {
      expect(parsePreset("project=1&eiProject=2").projectId).toBe(1);
    });

    it("drops a project id below the minimum of 1", () => {
      expect(parsePreset("project=0").projectId).toBeUndefined();
    });

    it("drops a non-numeric project id", () => {
      expect(parsePreset("project=abc").projectId).toBeUndefined();
    });
  });

  describe("sampleId", () => {
    it("parses the `sampleId` param", () => {
      expect(parsePreset("sampleId=14802").sampleId).toBe(14802);
    });

    it("drops invalid sample ids", () => {
      expect(parsePreset("sampleId=0").sampleId).toBeUndefined();
      expect(parsePreset("sampleId=nope").sampleId).toBeUndefined();
      expect(parsePreset("sample=77").sampleId).toBeUndefined();
    });
  });

  describe("category", () => {
    it("parses a known category", () => {
      expect(parsePreset("category=testing").category).toBe("testing");
    });

    it("is case-insensitive", () => {
      expect(parsePreset("category=ANOMALY").category).toBe("anomaly");
    });

    it("drops an unknown category", () => {
      expect(parsePreset("category=bogus").category).toBeUndefined();
    });
  });

  describe("labels", () => {
    it("splits a comma list, trims, and drops empties", () => {
      expect(parsePreset("labels=cat,%20dog%20,,bird").labels).toEqual(["cat", "dog", "bird"]);
    });

    it("is omitted when only empties are present", () => {
      expect(parsePreset("labels=,,").labels).toBeUndefined();
    });
  });

  describe("task / mode enums", () => {
    it("parses task", () => {
      expect(parsePreset("task=detect").task).toBe("detect");
      expect(parsePreset("task=sam").task).toBe("sam");
      expect(parsePreset("task=transcribe").task).toBe("transcribe");
    });

    it("drops an invalid task", () => {
      expect(parsePreset("task=segment").task).toBeUndefined();
    });

    it("parses mode", () => {
      expect(parsePreset("mode=import").mode).toBe("import");
    });
  });

  describe("autoAdvance / embed booleans", () => {
    it.each(["1", "true", "yes", "on", "TRUE", "On"])("treats %s as true", (v) => {
      expect(parsePreset(`autoAdvance=${v}`).autoAdvance).toBe(true);
    });

    it.each(["0", "false", "no", "off"])("treats %s as false", (v) => {
      expect(parsePreset(`autoAdvance=${v}`).autoAdvance).toBe(false);
    });

    it("drops an unrecognized boolean spelling", () => {
      expect(parsePreset("autoAdvance=maybe").autoAdvance).toBeUndefined();
    });

    it("parses autoAnnotate and autoAccept booleans", () => {
      expect(parsePreset("autoAnnotate=1").autoAnnotate).toBe(true);
      expect(parsePreset("autoAccept=true").autoAccept).toBe(true);
      expect(parsePreset("autoAnnotate=off").autoAnnotate).toBe(false);
      expect(parsePreset("autoAccept=nope").autoAccept).toBeUndefined();
    });

    it("parses embed independently", () => {
      expect(parsePreset("embed=yes").embed).toBe(true);
    });
  });

  describe("limit / offset", () => {
    it("accepts a limit within 1..1000", () => {
      expect(parsePreset("limit=250").limit).toBe(250);
    });

    it("drops a limit above 1000", () => {
      expect(parsePreset("limit=1001").limit).toBeUndefined();
    });

    it("drops a limit below 1", () => {
      expect(parsePreset("limit=0").limit).toBeUndefined();
    });

    it("accepts offset 0", () => {
      expect(parsePreset("offset=0").offset).toBe(0);
    });

    it("drops a negative offset", () => {
      expect(parsePreset("offset=-5").offset).toBeUndefined();
    });
  });

  describe("theme", () => {
    it.each(["dark", "light", "unicorn"])("parses the %s theme", (t) => {
      expect(parsePreset(`theme=${t}`).theme).toBe(t);
    });

    it("drops an unknown theme", () => {
      expect(parsePreset("theme=solarized").theme).toBeUndefined();
    });
  });

  describe("hosts", () => {
    it("keeps and trims studioHost and ingestionHost", () => {
      const preset = parsePreset("studioHost=%20https://studio.example%20&ingestionHost=https://ingest.example");
      expect(preset.studioHost).toBe("https://studio.example");
      expect(preset.ingestionHost).toBe("https://ingest.example");
    });
  });

  it("parses a full, mixed query into a complete preset", () => {
    const preset = parsePreset(
      "apiKey=ei_live&project=12&sampleId=34&category=training&labels=a,b&task=classify&mode=relabel&autoAdvance=1&limit=50&offset=10&theme=unicorn&embed=0&studioHost=https://s&ingestionHost=https://i",
    );
    expect(preset).toEqual({
      apiKey: "ei_live",
      projectId: 12,
      sampleId: 34,
      category: "training",
      labels: ["a", "b"],
      task: "classify",
      mode: "relabel",
      autoAdvance: true,
      limit: 50,
      offset: 10,
      theme: "unicorn",
      embed: false,
      studioHost: "https://s",
      ingestionHost: "https://i",
    });
  });
});
