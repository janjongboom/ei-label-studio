import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ConnectPanel } from "@/components/connect-panel";
import { UnicornHero } from "@/components/unicorn-decor";
import { HeroSpotlight } from "@/components/hero-spotlight";
import { Badge } from "@/components/ui/badge";
import { AudioLines, ImageIcon, Activity, Link2, Cloud, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    icon: ImageIcon,
    title: "Image, audio & time-series",
    body: "Templates that map straight onto Edge Impulse modalities — classification, bounding boxes, audio classes, and multi-axis sensor labels.",
  },
  {
    icon: Link2,
    title: "URL-driven",
    body: "Pre-load a project, filter, and labeling template from a shareable link. Deep-link presets in the spirit of synthetic-data-studio.",
  },
  {
    icon: Cloud,
    title: "Round-trips to EI",
    body: "Pull raw samples from your project, label them, and push corrections back via the Studio & Ingestion APIs — no copies, no exports.",
  },
  {
    icon: ShieldCheck,
    title: "Keys stay server-side",
    body: "Your API key is sealed into an encrypted tab-scoped session token and proxied through serverless functions.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="relative flex-1">
        {/* Hero */}
        <section className="hero-grid relative overflow-hidden">
          <div className="grid-lines pointer-events-none absolute inset-0" />
          <HeroSpotlight />
          <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 lg:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="space-y-6">
                <UnicornHero />
                <Badge
                  variant="secondary"
                  className="gap-1.5 rounded-full border border-border/60 px-3 py-1"
                >
                  <span className="size-1.5 rounded-full bg-primary" />
                  Label Studio × Edge Impulse
                </Badge>
                <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  Your Edge Impulse data,{" "}
                  <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
                    labeled and ready.
                  </span>
                </h1>
                <p className="max-w-xl text-pretty text-lg text-muted-foreground">
                  Connect a project, pull its samples, and relabel them in an embedded Label
                  Studio canvas — then push every correction straight back to Edge Impulse.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1">
                    <ImageIcon className="size-3.5" /> Images
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1">
                    <AudioLines className="size-3.5" /> Audio
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1">
                    <Activity className="size-3.5" /> Time-series
                  </span>
                </div>
              </div>

              <div className="mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
                <ConnectPanel />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card/50 p-5 transition hover:border-primary/40"
              >
                <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mb-1 font-medium">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>
            Built for{" "}
            <a href="https://edgeimpulse.com" className="text-foreground hover:underline">
              Edge Impulse
            </a>{" "}
            with{" "}
            <a href="https://labelstud.io" className="text-foreground hover:underline">
              Label Studio
            </a>
            .
          </p>
          <Link href="/docs" className="hover:text-foreground">
            URL parameters reference →
          </Link>
        </div>
      </footer>
    </>
  );
}
