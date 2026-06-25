import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "URL parameters — EI Label Studio",
  description: "Deep-link presets that pre-configure the labeling workspace.",
};

interface Param {
  name: string;
  alias?: string;
  type: string;
  desc: string;
}

const PARAMS: Param[] = [
  { name: "apiKey", type: "ei_…", desc: "Edge Impulse API key. Used to open a session, then stripped from the address bar." },
  { name: "project", alias: "eiProject", type: "int ≥ 1", desc: "Project ID to connect to. Not required when apiKey is provided (API keys are scoped to a single project)." },
  { name: "category", type: "training | testing | anomaly", desc: "Which dataset split to load." },
  { name: "labels", type: "comma list", desc: "Filter the sample queue to these labels, e.g. labels=dog,cat." },
  { name: "task", type: "classify | detect | audio | timeseries | sam | transcribe", desc: "Force a labeling template instead of auto-detecting per sample." },
  { name: "mode", type: "relabel | import", desc: "Relabel existing samples, or import-and-label new data." },
  { name: "autoAdvance", type: "bool", desc: "Jump to the next unlabeled sample after each submit. Default: false." },
  { name: "autoAnnotate", type: "bool", desc: "Turn on Auto-Annotation (interactive SAM) so smart-tool clicks request a mask + box. Use with task=sam. Default: true." },
  { name: "autoAccept", type: "bool", desc: "Auto-accept SAM suggestions instead of confirming each one. Use with autoAnnotate. Default: true." },
  { name: "limit", type: "int 1–1000", desc: "How many samples to pull into the queue." },
  { name: "offset", type: "int ≥ 0", desc: "Pagination offset into the dataset." },
  { name: "theme", type: "dark | light | unicorn", desc: "Force the colour scheme." },
  { name: "embed", type: "bool", desc: "Hide chrome for embedding the workspace in an iframe." },
  { name: "studioHost", type: "host", desc: "Override the Studio API base (self-hosted / staging EI)." },
  { name: "ingestionHost", type: "host", desc: "Override the Ingestion API base." },
];

export default function DocsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <div className="space-y-3">
          <Badge variant="secondary" className="rounded-full">Reference</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">URL parameters</h1>
          <p className="max-w-2xl text-muted-foreground">
            Every workspace setting can be pre-loaded from the URL — handy for sharing a ready-to-go
            labeling session or embedding it elsewhere. Presets are read <em>once</em> on load
            (they don&apos;t sync back into the URL). Booleans accept{" "}
            <code className="rounded bg-secondary px-1 text-xs">1/true/yes/on</code>, enums are
            case-insensitive, and anything invalid is silently ignored.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Parameter</th>
                <th className="px-4 py-2.5 font-medium">Values</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PARAMS.map((p) => (
                <tr key={p.name} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {p.name}
                    {p.alias && (
                      <span className="block text-muted-foreground">/ {p.alias}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                    {p.type}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 space-y-3">
          <h2 className="text-lg font-medium">Example</h2>
          <pre className="overflow-x-auto rounded-lg border border-border bg-card/60 p-4 text-xs">
            <code>{`https://label.jennyspeelman.dev/?apiKey=ei_abc123&category=training&task=audio&autoAdvance=1`}</code>
          </pre>
          <p className="text-sm text-muted-foreground">
            Connects using the API key (which is scoped to a single project), loads the training set
            with the audio-classification template and auto-advance on. The key is sealed into an
            encrypted tab-scoped session token and removed from the URL on load.
          </p>
        </div>

        <div className="mt-10 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">← Back home</Link>
        </div>
      </main>
    </>
  );
}
