"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  KeyRound,
  Loader2,
  LogOut,
  Boxes,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { connect, disconnect, getProjects, setEiDebugSession } from "@/lib/ei-client";
import { labelingMethodLabel } from "@/lib/project-type";
import { parsePreset, getIframeQueryParams } from "@/lib/url-params";
import { useApp } from "@/lib/store";
import type { EIProject } from "@/lib/types";

export function ConnectPanel() {
  const router = useRouter();
  const { setConnected, applyPreset } = useApp();

  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [studioHost, setStudioHost] = useState("");
  const [ingestionHost, setIngestionHost] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [projects, setProjects] = useState<EIProject[] | null>(null);
  const autoConnected = useRef(false);

  // Apply URL presets once and detect an existing session.
  useEffect(() => {
    const preset = parsePreset(getIframeQueryParams());
    applyPreset(preset);
    setEiDebugSession(!!preset.debugSession);
    if (preset.apiKey) setApiKey(preset.apiKey);
    if (preset.projectId) setProjectId(String(preset.projectId));
    if (preset.studioHost) setStudioHost(preset.studioHost);
    if (preset.ingestionHost) setIngestionHost(preset.ingestionHost);
    if (preset.studioHost || preset.ingestionHost) setShowAdvanced(true);

    // Strip the apiKey from the address bar so it isn't shared accidentally.
    if (preset.apiKey && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("apiKey");
      window.history.replaceState({}, "", url.toString());
    }

    (async () => {
      try {
        const existing = await getProjects();
        if (existing.length) {
          setProjects(existing);
          setConnected(existing[0]);
        }
      } catch {
        /* not connected yet */
      } finally {
        setChecking(false);
      }

      if (preset.apiKey && !autoConnected.current) {
        autoConnected.current = true;
        // A URL that carries the key is a deep link — drop straight into the
        // workspace instead of stopping at the project picker.
        void doConnect(
          preset.apiKey,
          preset.projectId ? String(preset.projectId) : "",
          preset.studioHost,
          preset.ingestionHost,
          { openWorkspace: true },
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doConnect(
    key: string,
    pid: string,
    sHost?: string,
    iHost?: string,
    opts?: { openWorkspace?: boolean },
  ) {
    if (!key.trim()) {
      toast.error("Enter your Edge Impulse API key.");
      return;
    }
    setBusy(true);
    try {
      const { project } = await connect({
        apiKey: key.trim(),
        projectId: pid.trim() ? Number(pid) : undefined,
        studioHost: sHost?.trim() || undefined,
        ingestionHost: iHost?.trim() || undefined,
      });
      setConnected(project);
      if (opts?.openWorkspace) {
        toast.success(`Connected to ${project.name}`);
        router.push("/label");
        return;
      }
      const all = await getProjects().catch(() => [project]);
      setProjects(all.length ? all : [project]);
      toast.success(`Connected to ${project.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    setProjects(null);
    setConnected(null);
    toast.message("Disconnected");
  }

  if (checking) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Checking connection…
        </CardContent>
      </Card>
    );
  }

  // Connected → single project (API keys are scoped to one project).
  if (projects?.length) {
    const p = projects[0];
    return (
      <Card className="w-full overflow-hidden">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Connected to Edge Impulse
            </div>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              <LogOut className="size-3.5" /> Disconnect
            </Button>
          </div>

          <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <Boxes className="size-8 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium leading-tight">{p.name}</span>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                  #{p.id}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="w-fit bg-primary/15 text-primary hover:bg-primary/15">
                  {labelingMethodLabel(p.labelingMethod)}
                </Badge>
                {p.ownerName && (
                  <span className="truncate text-xs text-muted-foreground">{p.ownerName}</span>
                )}
              </div>
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={() => router.push("/label")}>
            Open labeling workspace <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Not connected → connect form.
  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="apiKey">Edge Impulse API key</Label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="apiKey"
              type="password"
              placeholder="ei_0a1b2c…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  doConnect(apiKey, projectId, studioHost, ingestionHost, { openWorkspace: true });
              }}
              className="pl-9 font-mono"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your project is detected automatically from the key.
          </p>
        </div>

        {showAdvanced && (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="projectId" className="text-xs">Project ID override</Label>
              <Input
                id="projectId"
                inputMode="numeric"
                placeholder="Auto-detected — leave blank"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value.replace(/[^0-9]/g, ""))}
                className="text-xs font-mono"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="studioHost" className="text-xs">Studio host</Label>
                <Input
                  id="studioHost"
                  placeholder="studio.edgeimpulse.com"
                  value={studioHost}
                  onChange={(e) => setStudioHost(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ingestionHost" className="text-xs">Ingestion host</Label>
                <Input
                  id="ingestionHost"
                  placeholder="ingestion.edgeimpulse.com"
                  value={ingestionHost}
                  onChange={(e) => setIngestionHost(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          disabled={busy}
          onClick={() => doConnect(apiKey, projectId, studioHost, ingestionHost, { openWorkspace: true })}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {busy ? "Connecting…" : "Connect project"}
        </Button>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <ChevronDown className={`size-3 transition ${showAdvanced ? "rotate-180" : ""}`} />
            Advanced
          </button>
          <a
            href="https://studio.edgeimpulse.com/studio/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            Find your key <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Your key is sealed into an encrypted tab-scoped session token and proxied server-side.
          It is removed from the URL after connecting.
        </p>
      </CardContent>
    </Card>
  );
}
