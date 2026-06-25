"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { LogoMark } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  SkipForward,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SampleQueue } from "@/components/sample-queue";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { LS_VENDOR_CSS, LS_VENDOR_JS } from "@/lib/ls-vendor";
import {
  connect,
  getEiSessionToken,
  getSamples,
  getProjects,
  relabel,
  setBoundingBoxes,
  getProjectMetadata,
  setEiDebugSession,
} from "@/lib/ei-client";
import { parsePreset, getIframeQueryParams } from "@/lib/url-params";
import { detectModality } from "@/lib/modality";
import { defaultTaskFor, projectTypeLabel } from "@/lib/project-type";
import { buildLabelConfig, channelsForSample } from "@/lib/ls-config";
import { sampleToTask, labelFromAnnotation, boxesFromAnnotation, mediaUrl } from "@/lib/mapping";
import type { EICategory, LabelTask } from "@/lib/types";

const LabelStudio = dynamic(() => import("@/components/label-studio"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading canvas…
    </div>
  ),
});

const TASK_LABELS: Record<LabelTask, string> = {
  classify: "Image · classify",
  detect: "Image · detect",
  audio: "Audio · classify",
  transcribe: "Audio · transcribe",
  timeseries: "Time-series",
  sam: "Image · Segment Anything (SAM)",
};

export function Workspace() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const {
    connected,
    project,
    embed,
    samples,
    category,
    task: forcedTask,
    autoAdvance,
    autoAnnotate,
    autoAccept,
    activeIndex,
    setConnected,
    applyPreset,
    setSamples,
    setActiveIndex,
    setCategory,
    setTask,
    markLabeled,
    labelFilter,
    setLabelFilter,
    limit,
    setAutoAdvance,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [hydrating, setHydrating] = useState(!connected);
  const [labeledIds, setLabeledIds] = useState<Set<number>>(new Set());
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [metadataLabels, setMetadataLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [resolvedDims, setResolvedDims] = useState<{ width: number; height: number } | null>(null);
  const [dimsLoading, setDimsLoading] = useState(false);
  const inspectorRef = useRef<ImperativePanelHandle>(null);
  const didAutoCollapse = useRef(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const projectId = project?.id;
  const sessionToken = getEiSessionToken();

  // Warm the large vendored Label Studio bundle as soon as the workspace mounts,
  // so its download overlaps the samples fetch instead of starting only once the
  // iframe has booted. The iframe requests the very same URLs (cache hit).
  useEffect(() => {
    preload(LS_VENDOR_JS, { as: "script" });
    preload(LS_VENDOR_CSS, { as: "style" });
  }, []);

  // On narrow screens the editor + two side panels don't fit, so start with the
  // inspector collapsed (its info is also shown inside the editor). Runs once,
  // after the panels actually mount.
  useEffect(() => {
    const ready = !hydrating && connected && !!project;
    if (ready && !didAutoCollapse.current) {
      didAutoCollapse.current = true;
      if (window.innerWidth < 1280) inspectorRef.current?.collapse();
    }
  }, [hydrating, connected, project]);

  const toggleInspector = () => {
    const p = inspectorRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };

  // On direct loads the in-memory store is empty even when the tab-scoped
  // session token is valid. Apply URL presets, then rehydrate from the existing session
  // before deciding whether to send the user back to connect.
  useEffect(() => {
    if (connected && project) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    const preset = parsePreset(getIframeQueryParams());
    applyPreset(preset);
    setEiDebugSession(!!preset.debugSession);
    if (preset.theme) setTheme(preset.theme);
    if (preset.apiKey && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("apiKey");
      window.history.replaceState({}, "", url.toString());
    }
    (async () => {
      try {
        if (preset.apiKey) {
          const { project: connectedProject } = await connect({
            apiKey: preset.apiKey,
            projectId: preset.projectId,
            studioHost: preset.studioHost,
            ingestionHost: preset.ingestionHost,
          });
          if (cancelled) return;
          setConnected(connectedProject);
          setHydrating(false);
          return;
        }
        const projects = await getProjects();
        if (cancelled) return;
        if (projects.length) {
          setConnected(projects[0]);
          setHydrating(false);
        } else {
          router.replace("/");
        }
      } catch {
        if (!cancelled) router.replace("/");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSamples = useCallback(async () => {
    setLoading(true);
    try {
      const { samples: list } = await getSamples({
        category,
        limit,
        labels: labelFilter.length ? labelFilter : undefined,
        expectedProjectId: projectId,
      });
      setSamples(list, list.length);
      setLabeledIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load samples");
    } finally {
      setLoading(false);
    }
  }, [category, limit, labelFilter, projectId, setSamples]);

  useEffect(() => {
    if (connected && project) {
      void getProjectMetadata(project.id)
        .then((res) => {
          if (res?.metadata?.type === "classes") {
            const labels = res.metadata.all?.labels?.map((l) => l.label) ?? [];
            setMetadataLabels(labels);
          }
        })
        .catch(() => {});
    } else {
      setMetadataLabels([]);
    }
  }, [connected, project]);

  useEffect(() => {
    if (connected && project) void loadSamples();
  }, [connected, project, category, loadSamples]);

  const active = samples[activeIndex];

  const effectiveTask: LabelTask = useMemo(() => {
    if (forcedTask) return forcedTask;
    return active ? defaultTaskFor(detectModality(active), project?.labelingMethod) : "classify";
  }, [forcedTask, active, project]);

  // Dominant modality across the loaded set, for the project-type label.
  const projectModality = useMemo(() => {
    if (!samples.length) return undefined;
    const counts: Record<string, number> = {};
    for (const s of samples) {
      const m = detectModality(s);
      counts[m] = (counts[m] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as
      | ReturnType<typeof detectModality>
      | undefined;
  }, [samples]);

  // Class vocabulary = the project's distinct classes ∪ custom labels.
  // EI summarizes multi-class samples as a comma-joined string (e.g.
  // "coffee, lamp"), so split those into individual classes, and pull labels
  // off any bounding boxes too.
  const labelSet = useMemo(() => {
    const set = new Set<string>();
    const addLabel = (raw?: string) => {
      if (!raw || raw === "unlabeled") return;
      for (const part of raw.split(",")) {
        const v = part.trim();
        if (v) set.add(v);
      }
    };
    for (const s of samples) {
      addLabel(s.label);
      s.boundingBoxes?.forEach((b) => addLabel(b.label));
    }
    for (const l of metadataLabels) set.add(l);
    for (const l of customLabels) set.add(l);
    addLabel(active?.label);
    return Array.from(set).sort();
  }, [samples, metadataLabels, customLabels, active]);

  const config = useMemo(
    () =>
      buildLabelConfig({
        task: effectiveTask,
        labels: labelSet,
        channels: active ? channelsForSample(active) : undefined,
      }),
    [effectiveTask, labelSet, active],
  );

  // Load the active image in the background to resolve natural dimensions (respecting browser auto-rotation of EXIF metadata)
  useEffect(() => {
    if (!active || !project?.id || (effectiveTask !== "detect" && effectiveTask !== "sam")) {
      setResolvedDims(null);
      setDimsLoading(false);
      return;
    }

    setDimsLoading(true);
    const activeId = active.id;
    const img = new window.Image();
    
    img.onload = () => {
      if (active.id === activeId) {
        setResolvedDims({ width: img.naturalWidth, height: img.naturalHeight });
        setDimsLoading(false);
      }
    };
    
    img.onerror = () => {
      if (active.id === activeId) {
        setResolvedDims(active.imageDimensions || null);
        setDimsLoading(false);
      }
    };
    
    img.src = mediaUrl(project.id, active.id, "image", sessionToken);
  }, [active, project?.id, effectiveTask, sessionToken]);

  const lsTask = useMemo(() => {
    if (!active || !project) return null;
    const sampleCopy = resolvedDims
      ? { ...active, imageDimensions: resolvedDims }
      : active;
    return sampleToTask(sampleCopy, project.id, effectiveTask, sessionToken);
  }, [active, project, effectiveTask, resolvedDims, sessionToken]);

  const goTo = useCallback(
    (i: number) => {
      if (i >= 0 && i < samples.length) setActiveIndex(i);
    },
    [samples.length, setActiveIndex],
  );

  const advance = useCallback(() => {
    if (!autoAdvance) return;
    const next = samples.findIndex((s, i) => i > activeIndex && !labeledIds.has(s.id));
    goTo(next === -1 ? Math.min(activeIndex + 1, samples.length - 1) : next);
  }, [autoAdvance, samples, activeIndex, labeledIds, goTo]);

  const handleSubmit = useCallback(
    async (annotation: unknown) => {
      if (!active || !project) return;
      setSubmitting(true);
      try {
        if (effectiveTask === "detect" || effectiveTask === "sam") {
          // Object detection: push the (edited) boxes back to EI as pixels.
          const dims = resolvedDims || active.imageDimensions;
          const boxes = boxesFromAnnotation(annotation, dims);
          await setBoundingBoxes(active.id, boxes, project.id);

          const boxLabels = Array.from(new Set(boxes.map((b) => b.label)))
            .sort()
            .join(", ");
          const newLabel = boxLabels || "unlabeled";

          markLabeled(active.id, newLabel, boxes);
          setLabeledIds((prev) => new Set(prev).add(active.id));
          toast.success(
            boxes.length
              ? `Saved ${boxes.length} box${boxes.length > 1 ? "es" : ""} to Edge Impulse`
              : "Cleared all boxes in Edge Impulse",
          );
          advance();
          return;
        }

        if (effectiveTask === "timeseries") {
          const label = labelFromAnnotation(annotation);
          if (!label) {
            toast.error("Add a labeled segment before submitting.");
            return;
          }
          await relabel(active.id, label, project.id);
          markLabeled(active.id, label);
          setLabeledIds((prev) => new Set(prev).add(active.id));
          toast.success(`Sample label set to “${label}”`, {
            description: "Per-segment labels aren't pushed back to EI yet.",
          });
          advance();
          return;
        }

        // classify / audio / transcribe
        const label = labelFromAnnotation(annotation);
        if (label === null || label === undefined) {
          toast.error(effectiveTask === "transcribe" ? "Add a transcription before submitting." : "Pick a class before submitting.");
          return;
        }
        await relabel(active.id, label, project.id);
        markLabeled(active.id, label);
        setLabeledIds((prev) => new Set(prev).add(active.id));
        toast.success(effectiveTask === "transcribe" ? `Transcribed to “${label}”` : `Relabeled to “${label}”`);
        advance();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSubmitting(false);
      }
    },
    [active, effectiveTask, resolvedDims, advance, markLabeled, project],
  );

  // Embed mode hides the surrounding chrome for iframe use.
  useEffect(() => {
    const el = document.documentElement;
    if (embed) el.classList.add("embed-mode");
    return () => el.classList.remove("embed-mode");
  }, [embed]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      if (e.key === "[") goTo(activeIndex - 1);
      if (e.key === "]") goTo(activeIndex + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, goTo]);

  function addCustomLabel() {
    const v = newLabel.trim();
    if (!v) return;
    setCustomLabels((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setNewLabel("");
  }

  if (hydrating || !connected || !project) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Restoring session…
      </div>
    );
  }

  const progress = samples.length ? (labeledIds.size / samples.length) * 100 : 0;

  return (
    <div className="relative flex min-h-0 flex-1">
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="ei-workspace-cols"
      className={cn("min-h-0 flex-1", resizing && "select-none [&_iframe]:pointer-events-none")}
    >
      {/* Left: queue */}
      <ResizablePanel defaultSize={20} minSize={13} maxSize={34} className="min-w-0">
      <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar/40">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border/60 px-3">
          <Link href="/" className="flex min-w-0 items-center gap-2" title="Back to projects">
            <LogoMark className="size-5 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-tight">EI · Label Studio</span>
          </Link>
          <ThemeMenu />
        </div>
        <div className="space-y-3 border-b border-border/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as EICategory)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="training">Training set</SelectItem>
                <SelectItem value="testing">Testing set</SelectItem>
                <SelectItem value="anomaly">Anomaly set</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={labelFilter[0] || "all"}
              onValueChange={(v) => setLabelFilter(v === "all" ? [] : [v])}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All labels</SelectItem>
                {metadataLabels.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {labeledIds.size}/{samples.length} labeled
            </span>
            <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={loadSamples}>
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : samples.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No samples in the {category} set.
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <SampleQueue
              samples={samples}
              activeIndex={activeIndex}
              labeledIds={labeledIds}
              onSelect={goTo}
            />
          </div>
        )}
      </aside>
      </ResizablePanel>

      <ResizableHandle withHandle onDragging={setResizing} />

      {/* Center: canvas */}
      <ResizablePanel defaultSize={56} minSize={30} className="min-w-0">
      <section className="relative flex h-full min-h-0 flex-col bg-muted/20">
        <div className="flex h-14 items-center justify-between gap-4 border-b border-border/60 px-4">
          <div className="flex items-center gap-2 text-sm shrink-0">
            <Button variant="ghost" size="icon" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex <= 0}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular-nums text-muted-foreground whitespace-nowrap">
              {samples.length ? activeIndex + 1 : 0} / {samples.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex >= samples.length - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {active && <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline min-w-0 flex-1 text-center">{active.filename}</span>}
          <div className="flex items-center gap-2 pr-10 shrink-0">
            <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15 whitespace-nowrap">
              <Boxes className="size-3" />
              {projectTypeLabel(project, projectModality)}
            </Badge>
            <Badge variant="secondary" className="hidden gap-1 md:inline-flex whitespace-nowrap">
              <Tag className="size-3" />
              {TASK_LABELS[effectiveTask]}
            </Badge>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 min-w-0 overflow-hidden">
          {/* The canvas mounts immediately so the bundle downloads while samples
              load; the first task is pushed in once it's ready. */}
          <LabelStudio
            config={config}
            task={lsTask}
            autoAnnotate={autoAnnotate}
            autoAccept={autoAccept}
            sessionToken={sessionToken}
            onSubmit={handleSubmit}
            onSkip={() => goTo(activeIndex + 1)}
            onNav={(dir) => goTo(activeIndex + dir)}
          />
          {(!lsTask || dimsLoading) && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background text-muted-foreground">
              {loading || dimsLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Loading canvas…
                </>
              ) : (
                "Select a sample to begin."
              )}
            </div>
          )}
        </div>
      </section>
      </ResizablePanel>

      <ResizableHandle withHandle onDragging={setResizing} />

      {/* Right: inspector */}
      <ResizablePanel
        ref={inspectorRef}
        collapsible
        collapsedSize={0}
        defaultSize={24}
        minSize={16}
        maxSize={40}
        onCollapse={() => setInspectorCollapsed(true)}
        onExpand={() => setInspectorCollapsed(false)}
        className="min-w-0"
      >
      <aside className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
        <div className="space-y-1.5 pr-8">
          <h2 className="text-sm font-semibold leading-tight">{project.name}</h2>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
              {projectTypeLabel(project, projectModality)}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">#{project.id}</span>
          </div>
        </div>
        <Separator />

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Labeling template</span>
          <Select value={forcedTask ?? effectiveTask} onValueChange={(v) => setTask(v as LabelTask)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(!projectModality || projectModality === "image" || projectModality === "video") && (
                project?.labelingMethod === "object_detection" ? (
                  <>
                    <SelectItem value="sam">Image · Segment Anything (SAM)</SelectItem>
                    <SelectItem value="detect">Image · detect (boxes)</SelectItem>
                    <SelectItem value="classify">Image · classify</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="classify">Image · classify</SelectItem>
                    <SelectItem value="detect">Image · detect (boxes)</SelectItem>
                    <SelectItem value="sam">Image · Segment Anything (SAM)</SelectItem>
                  </>
                )
              )}
              {(!projectModality || projectModality === "audio") && (
                <>
                  <SelectItem value="audio">Audio · classify</SelectItem>
                  <SelectItem value="transcribe">Audio · transcribe</SelectItem>
                </>
              )}
              {(!projectModality || projectModality === "timeseries") && (
                <SelectItem value="timeseries">Time-series</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {active && (
          <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3 text-sm">
            <Row label="Current label">
              <Badge
                variant={active.label && active.label !== "unlabeled" ? "default" : "secondary"}
                className="h-auto whitespace-normal break-words text-left"
              >
                {active.label || "unlabeled"}
              </Badge>
            </Row>
            <Row label="Category">{active.category}</Row>
            {active.frequency ? <Row label="Frequency">{active.frequency} Hz</Row> : null}
            {active.totalLengthMs ? <Row label="Length">{Math.round(active.totalLengthMs)} ms</Row> : null}
            {active.sensors?.length ? <Row label="Axes">{active.sensors.map((s) => s.name).join(", ")}</Row> : null}
          </div>
        )}

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Classes ({labelSet.length})</span>
          <div className="flex flex-wrap gap-1.5">
            {labelSet.length ? (
              labelSet.map((l) => (
                <Badge key={l} variant="secondary" className="font-normal">
                  {l}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">None yet — add one below.</span>
            )}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomLabel()}
              placeholder="Add a class…"
              className="h-8 text-sm"
            />
            <Button size="icon" variant="secondary" className="size-8 shrink-0" onClick={addCustomLabel}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <Separator />
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Auto-advance</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 select-none">
                {autoAdvance ? "on" : "off"}
              </span>
              <button
                type="button"
                onClick={() => setAutoAdvance(!autoAdvance)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  autoAdvance ? "bg-primary" : "bg-muted border border-border"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    autoAdvance ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          </div>
          <p>
            Submit in the canvas to push the label to Edge Impulse. Use{" "}
            <kbd className="rounded bg-secondary px-1">[</kbd> /{" "}
            <kbd className="rounded bg-secondary px-1">]</kbd> to move between samples.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => goTo(activeIndex + 1)}>
            <SkipForward className="size-3.5" /> Skip sample
          </Button>
        </div>
        {submitting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Saving to Edge Impulse…
          </div>
        )}
      </aside>
      </ResizablePanel>
    </ResizablePanelGroup>

      {/* Inspector toggle: anchored to the workspace top-right so it never
          shifts when the inspector panel collapses or expands. */}
      <Button
        variant={inspectorCollapsed ? "secondary" : "ghost"}
        size="icon"
        onClick={toggleInspector}
        title={inspectorCollapsed ? "Show details panel" : "Hide details panel"}
        className="absolute right-2 top-2 z-50"
      >
        {inspectorCollapsed ? (
          <PanelRightOpen className="size-4" />
        ) : (
          <PanelRightClose className="size-4" />
        )}
      </Button>

    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{children}</span>
    </div>
  );
}
