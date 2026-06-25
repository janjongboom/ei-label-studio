"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { LSTask } from "@/lib/types";

/*
 * Host for the isolated Label Studio iframe (/embed/labeler). Keeping the
 * editor in its own document prevents its global stylesheet from leaking into
 * the app. Config + task are pushed in via postMessage; annotations come back
 * the same way.
 */

interface LabelStudioProps {
  config: string;
  /** Null while samples are still loading — the iframe mounts and warms the
   *  Label Studio bundle, and we push the first task once it's ready. */
  task: LSTask | null;
  onSubmit: (annotation: unknown) => void;
  onSkip?: () => void;
  /** Sample navigation forwarded from inside the iframe ([ and ] keys). */
  onNav?: (dir: number) => void;
  /** Seed Label Studio's Auto-Annotation toggle + auto-accept (from URL presets). */
  autoAnnotate?: boolean;
  autoAccept?: boolean;
  sessionToken?: string | null;
}

export default function LabelStudio({
  config,
  task,
  onSubmit,
  onSkip,
  onNav,
  autoAnnotate,
  autoAccept,
  sessionToken,
}: LabelStudioProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const { resolvedTheme } = useTheme();
  const handlers = useRef({ onSubmit, onSkip, onNav });
  handlers.current = { onSubmit, onSkip, onNav };

  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;

  // URL-preset flags for the interactive SAM controls; kept in a ref so the
  // latest values are sent with every render message.
  const flagsRef = useRef({ autoAnnotate, autoAccept });
  flagsRef.current = { autoAnnotate, autoAccept };

  // Use a unique session token as a cache-buster so the iframe page reloads
  // fresh on mount but stays constant while hot-reloading samples. Lazy state
  // initializer → computed once per mount, not on every render.
  const [cacheBuster] = useState(() => Math.random().toString(36).substring(7));

  useEffect(() => {
    if (ready.current) {
      const origin = window.location.origin;
      iframeRef.current?.contentWindow?.postMessage(
        { source: "ls-host", type: "theme", theme: resolvedTheme },
        origin,
      );
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const origin = window.location.origin;

    const send = () => {
      // Nothing to render until the first sample/task is ready; the iframe is
      // already mounted and loading the bundle in the meantime.
      if (!task) return;
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: "ls-host",
          type: "render",
          config,
          task,
          theme: themeRef.current,
          autoAnnotate: flagsRef.current.autoAnnotate,
          autoAccept: flagsRef.current.autoAccept,
          sessionToken,
        },
        origin,
      );
    };

    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      const d = e.data;
      if (d?.source !== "ls-embed") return;
      if (d.type === "ready") {
        ready.current = true;
        send();
      } else if (d.type === "submit") {
        handlers.current.onSubmit(d.annotation);
      } else if (d.type === "skip") {
        handlers.current.onSkip?.();
      } else if (d.type === "nav") {
        handlers.current.onNav?.(d.dir);
      } else if (d.type === "error") {
        toast.error(`Canvas error: ${d.annotation}`);
      }
    }

    window.addEventListener("message", onMessage);
    // If the iframe is already up (config/task changed), push the new sample.
    if (ready.current) send();

    return () => window.removeEventListener("message", onMessage);
  }, [config, task, sessionToken]);

  return (
    <div className="h-full w-full bg-background">
      <iframe
        ref={iframeRef}
        src={`/embed/labeler?theme=${resolvedTheme || "light"}&v=${cacheBuster}`}
        title="Label Studio"
        className="h-full w-full min-w-0 border-0 bg-background"
      />
    </div>
  );
}
