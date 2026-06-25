# EI Label Studio

A Vercel-hosted [Label Studio](https://labelstud.io/) wrapper for
[Edge Impulse](https://edgeimpulse.com/). Connect an Edge Impulse project, pull its data
samples, relabel them in an embedded Label Studio canvas, and push every correction straight
back to Edge Impulse — all driven by shareable URLs.

🔗 **Live:** https://label.jennyspeelman.dev

![Edge Impulse Label Studio with Segment Anything annotation](docs/ei-label-studio.png)
*Edge Impulse Label Studio with Segment Anything annotation*

## Features

- **Connect with an API key** — paste a project API key (`ei_…`) + project ID. The key is sealed
  into an encrypted, tab-scoped session token and proxied server-side, so separate tabs/iframes
  can connect to different projects independently.
- **Image, audio & time-series** — labeling templates that map onto Edge Impulse modalities:
  image classification, bounding boxes, audio classification, and multi-axis time-series labels.
  The modality is auto-detected per sample, or you can force a template.
- **Round-trips to EI** — samples are pulled via the Studio API; the current label is shown as a
  pre-annotation; submitting relabels the sample back in Edge Impulse.
- **Interactive segmentation (SAM)** — a Segment Anything template enables Point2Label /
  Bbox2Label: click or drag and a hosted SAM 2.1 backend on Beam Cloud returns a mask + bounding box. The
  mask stays in the canvas; the bounding box is pushed back to Edge Impulse. See [`ml-backend/`](ml-backend/).
- **URL-driven** — deep-link presets (project, category, template, filters, theme, embed…) in the
  spirit of [synthetic-data-studio](https://github.com/yennster/synthetic-data-studio/blob/main/docs/url-parameters.md).
  See [`docs/url-parameters.md`](docs/url-parameters.md) or the in-app [`/docs`](https://label.jennyspeelman.dev/docs) page.
- **Embeddable** — `?embed=1` strips the chrome for iframe use.

## How it works

```
Browser --POST /api/ei/session--> encrypted session token (apiKey + projectId)
   |
   |- GET  /api/ei/projects        -> Studio  GET /v1/api/projects
   |- GET  /api/ei/samples         -> Studio  GET /v1/api/{projectId}/raw-data
   |- GET  /api/ei/media/{p}/{s}   -> Studio  /raw-data/{s}/{image|wav}  (or synth CSV for series)
   |- POST /api/ei/relabel         -> Studio  POST /raw-data/{s}/rename
   \- POST /api/ei/upload          -> Ingestion POST /api/{category}/data
```

All Edge Impulse traffic is proxied through same-origin Next.js Route Handlers (Edge Impulse
blocks browser CORS). The Label Studio Frontend runs entirely client-side — there is **no**
Label Studio server. Its bundle is vendored under `public/vendor/label-studio`.

## Interactive segmentation (SAM)

The **Image · Segment Anything (SAM)** template adds SAM-style Point2Label / Bbox2Label. The PyTorch + SAM stack can't run on Vercel (no containers; functions cap at 500 MB), so the model is hosted separately and called server-side:

```
Canvas (smart tool) --> POST /api/ei/predict --> SAM backend (Beam Cloud GPU)
                              |  fetch image from EI, hand backend a temporary Blob URL
                              \- returns mask + bbox; the box is saved to EI on submit
```

Setup:

1. **Deploy the backend** — a GPU-enabled Beam Cloud deployment; see [`ml-backend/`](ml-backend/).
2. **Link a Vercel Blob store** to the project (Storage tab) — this sets `BLOB_READ_WRITE_TOKEN`,
   used to give the backend a temporary public URL for each image.
3. **Set `SAM_BACKEND_URL`** to the Beam deployment's `/predict` URL and `SAM_BACKEND_AUTH` to the Bearer Token. See [`.env.example`](.env.example).

## Local development

```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

Get a project API key from your Edge Impulse project **Dashboard -> Keys**, and the numeric
project ID from **Project info**.

## Tech

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Zustand · Label Studio Frontend.
Deployed on Vercel.

## Notes & limitations

- An Edge Impulse API key is scoped to a single project, so the project picker shows just that
  project. (Account-wide listing would require JWT login.)
- For **detect** (bounding-box) templates, edited boxes are pushed back to Edge Impulse via the
  Studio API. For **time-series** templates, the sample-level label is updated, but per-segment
  annotations are not yet pushed back.
- For **SAM**, the mask is an in-canvas labeling aid only — Edge Impulse stores bounding boxes,
  so the mask's bounding box is what gets saved. Requires the hosted backend ([`ml-backend/`](ml-backend/)).
- The standalone Label Studio Frontend npm package no longer ships a built bundle, so a known-good
  build is vendored in this repo and loaded on demand.
