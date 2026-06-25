# URL Parameters

Every workspace setting can be pre-loaded from the URL — handy for sharing a
ready-to-go labeling session or embedding the workspace in another page.

Presets are read **once** on page load (they don't sync back into the URL).
Booleans accept `1 / true / yes / on` (and their inverses), enums are
case-insensitive, and anything invalid is silently ignored.

## Parameter Reference

| Parameter | Alias | Values | Description |
|---|---|---|---|
| `apiKey` | | `ei_…` | Edge Impulse API key. Used to open a session, then stripped from the address bar. |
| `project` | `eiProject` | int ≥ 1 | Project ID to connect to. Not required when `apiKey` is provided (API keys are scoped to a single project). |
| `sampleId` | | int ≥ 1 | Open this sample first. The sample is added to the queue if it is not in the initial batch. |
| `category` | | `training` · `testing` · `anomaly` | Which dataset split to load. |
| `labels` | | comma-separated list | Filter the sample queue to these labels, e.g. `labels=dog,cat`. |
| `task` | | `classify` · `detect` · `audio` · `timeseries` · `sam` · `transcribe` | Force a labeling template instead of auto-detecting per sample. |
| `mode` | | `relabel` · `import` | Relabel existing samples, or import-and-label new data. |
| `autoAdvance` | | bool | Jump to the next unlabeled sample after each submit. Default: `false`. |
| `autoAnnotate` | | bool | Turn on Auto-Annotation (interactive SAM) so smart-tool clicks request a mask + box. Use with `task=sam`. Default: `true`. |
| `autoAccept` | | bool | Auto-accept SAM suggestions instead of confirming each one. Use with `autoAnnotate`. Default: `true`. |
| `limit` | | int 1–1000 | How many samples to pull into the queue. Default: `200`. |
| `offset` | | int ≥ 0 | Pagination offset into the dataset. |
| `theme` | | `dark` · `light` · `unicorn` | Force the colour scheme. |
| `embed` | | bool | Hide chrome for embedding the workspace in an iframe. |
| `studioHost` | | hostname | Override the Studio API base URL (for self-hosted / staging EI instances). |
| `ingestionHost` | | hostname | Override the Ingestion API base URL. |

## Examples

### Basic — open a project in one click

```
https://label.jennyspeelman.dev/?apiKey=ei_abc123
```

Connects using the API key (which is scoped to a single project). The key is
sealed into an encrypted tab-scoped session token and removed from the address
bar on load.

### Training set with audio template

```
https://label.jennyspeelman.dev/?apiKey=ei_abc123&category=training&task=audio&autoAdvance=1
```

Loads the training set with the audio-classification template and auto-advance
on. You can also add `project=123456` if you want to be explicit.

### Interactive segmentation (SAM), ready to click

```
https://label.jennyspeelman.dev/?apiKey=ei_abc123&task=sam&autoAnnotate=1&autoAccept=1
```

Opens the Segment Anything template with Auto-Annotation on and suggestions
auto-accepted, so a single smart-tool click yields a mask + bounding box (the box
is what's saved back to Edge Impulse). Requires the hosted SAM backend.

### Embedding in an iframe

```html
<iframe
  src="https://label.jennyspeelman.dev/label?apiKey=ei_abc123&embed=1&theme=dark"
  width="100%"
  height="700"
  style="border: none;"
></iframe>
```

The `embed=1` parameter hides the app chrome (header, sidebar) so only the
labeling canvas is shown. Combine with `theme` to match the host page.

### Unicorn mode 🦄

```
https://label.jennyspeelman.dev/?apiKey=ei_abc123&theme=unicorn
```

Activates the pastel-pink unicorn theme with rainbow accents and sparkle
animations.

## Notes

- The `apiKey` parameter is consumed on load and immediately removed from the
  URL for security. It is sealed into an encrypted session token kept in
  tab-scoped `sessionStorage`, so separate tabs or iframes can use different
  projects at the same time.
- Parameters are parsed by [`src/lib/url-params.ts`](../src/lib/url-params.ts).
- The in-app docs page at [`/docs`](https://label.jennyspeelman.dev/docs)
  mirrors this reference.
