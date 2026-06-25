"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type --
   This file monkey-patches DOM prototypes (scrollIntoView, scrollTo, focus, …)
   to suppress all scrolling inside the Label Studio iframe. Prototype patching
   genuinely needs `any` / `Function` types here; they're scoped to this file. */

import { useEffect, useRef } from "react";
import { LS_VENDOR_CSS, LS_VENDOR_JS } from "@/lib/ls-vendor";
import type { LSTask } from "@/lib/types";
import { getIframeQueryParams } from "@/lib/url-params";

/*
 * Isolated Label Studio document, loaded inside an iframe by the workspace.
 * Running it in its own document stops the Label Studio bundle's GLOBAL CSS
 * from leaking into the rest of the app. It talks to the host via postMessage.
 */

interface LSInstance {
  destroy?: () => void;
}
type LSConstructor = new (root: HTMLElement, options: Record<string, unknown>) => LSInstance;

declare global {
  interface Window {
    LabelStudio?: LSConstructor;
  }
}

let loaderPromise: Promise<LSConstructor> | null = null;
function loadLabelStudio(): Promise<LSConstructor> {
  if (window.LabelStudio) return Promise.resolve(window.LabelStudio);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<LSConstructor>((resolve, reject) => {
    if (!document.getElementById("ls-css")) {
      const link = document.createElement("link");
      link.id = "ls-css";
      link.rel = "stylesheet";
      link.href = LS_VENDOR_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LS_VENDOR_JS;
    script.async = true;
    script.onload = () =>
      window.LabelStudio ? resolve(window.LabelStudio) : reject(new Error("global missing"));
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("load failed"));
    };
    document.body.appendChild(script);
  });
  return loaderPromise;
}

function serializeAnnotation(annotation: unknown): unknown {
  const a = annotation as { serializeAnnotation?: () => unknown };
  if (typeof a?.serializeAnnotation === "function") return { result: a.serializeAnnotation() };
  return annotation;
}

/* Restyle Label Studio's action bar to match the app's shadcn buttons. */
const LS_THEME = `
body {
  background-color: var(--background) !important;
  background: var(--background) !important;
}

/* The editor centers itself with \`margin: 0 auto\` and clamps to a fixed
   300px width under its max-width:760px breakpoint. Inside our iframe that
   leaves large dead margins either side of the canvas. Anchor it left and
   let it fill the available width. */
.ls-editor,
[class*="editor--"] {
  margin: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
}

/* Force the content wrapper to take exactly the remaining height and not overflow vertically in desktop mode */
[class*="main-content-wrapper--"] {
  height: calc(100% - 48px) !important;
  max-height: calc(100% - 48px) !important;
  min-height: 0 !important;
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

/* Default side-by-side grid columns for canvas and sidebar (desktop mode) */
[class*="common--"]:not([class*="view-all--"]) {
  display: grid !important;
  grid-template-columns: 1fr 320px !important;
  grid-template-rows: 1fr !important;
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

/* Default sidebar styling (desktop mode) */
[class*="menu--"]:not(:empty) {
  margin: 0 !important;
  min-width: 320px !important;
  width: 320px !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
}

/* Default canvas container styling (desktop mode) */
.lsf-main-view {
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  /* Let the labeling controls scroll when they overflow (e.g. the SAM template's
     three mode sections) instead of clipping the last one off-screen. */
  overflow-y: auto !important;
  overflow-x: hidden !important;
  /* CLOSE THE GAP BELOW THE LABELS ROW.
     LS ships .lsf-main-view with justify-content: space-between. Because we
     force the main view to fill the iframe (height:100%), a short annotation
     (just the labels chips + a small object like coffee/lamp) gets pinned to
     the top while the sticky infobar is pushed to the bottom, leaving a large
     dead vertical gap between the labels and the section/divider below.
     Stacking from the top removes that oversized gap; the infobar is
     position:sticky; bottom:0, so it still pins to the bottom on its own.
     Scoped to .lsf-main-view only, so the canvas image area, timeseries plot,
     bounding-box layout (all inside __annotation) and the sidebar (a separate
     grid column) are untouched. */
  justify-content: flex-start !important;
}

/* NARROW VIEWPORTS: Stack canvas and sidebar vertically */
@media (max-width: 768px) {
  body {
    overflow-y: auto !important;
  }

  .ls-editor,
  [class*="editor--"] {
    height: auto !important;
    max-height: none !important;
    overflow-y: auto !important;
  }
  
  [class*="main-content-wrapper--"] {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  [class*="common--"]:not([class*="view-all--"]) {
    display: flex !important;
    flex-direction: column !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* Make canvas take full width and fit its content */
  .lsf-main-view {
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    min-height: 400px !important;
    min-width: 0 !important;
    flex: none !important;
  }

  /* Make sidebar take full width of the section and sit below the canvas */
  [class*="menu--"]:not(:empty) {
    width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    max-height: none !important;
    margin-top: 20px !important;
    margin-left: 0 !important;
    border-left: 0 !important;
    border-top: 1px solid rgba(0,0,0,.1) !important;
  }
}


.lsf-topbar {
  background-color: var(--card) !important;
  border-bottom: 1px solid var(--border) !important;
  width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  color: var(--foreground) !important;
}
.lsf-topbar * {
  color: var(--foreground) !important;
}
@media (max-width: 520px) {
  .ls-root .lsf-current-task {
    display: none !important;
  }
}
.lsf-controls { gap: 6px !important; padding: 8px 16px 8px 8px !important; }
.lsf-controls .lsf-button {
  height: 34px !important;
  width: auto !important;
  min-width: 0 !important;
  padding: 0 12px !important;
  border-radius: 8px !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  box-shadow: none !important;
  border: 1px solid transparent !important;
  text-transform: none !important;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease !important;
}
.lsf-controls .lsf-button_look_primary {
  background: var(--primary) !important;
  color: var(--primary-foreground) !important;
}
.lsf-controls .lsf-button_look_primary:hover {
  background: color-mix(in oklch, var(--primary) 85%, black) !important;
}
.lsf-controls .lsf-button_look_danger,
.lsf-controls .lsf-button_look_normal {
  background: var(--secondary) !important;
  color: var(--secondary-foreground) !important;
  border: 1px solid var(--border) !important;
}
.lsf-controls .lsf-button_look_danger:hover,
.lsf-controls .lsf-button_look_normal:hover {
  background: var(--accent) !important;
  color: var(--accent-foreground) !important;
  border: 1px solid var(--border) !important;
}
.lsf-topbar button[aria-label="Settings"]:not([class*="dynamic-preannotations"]) { display: none !important; }

/* Custom variables inside Label Studio matching our tailwind theme */
.ls-editor,
[class*="editor--"] {
  background-color: var(--background) !important;
  color: var(--foreground) !important;
}

.lsf-main-view {
  background-color: var(--background) !important;
}

html.dark .ls-root .lsf-tool,
html.unicorn .ls-root .lsf-tool {
  --text-color: var(--muted-foreground) !important;
  --text-color-hover: var(--foreground) !important;
}

html.dark .ls-root .lsf-tool_active > .lsf-tool__icon,
html.unicorn .ls-root .lsf-tool_active > .lsf-tool__icon {
  background-color: var(--accent) !important;
  box-shadow: none !important;
}

/* Sidebar and lists */
html.dark .ls-root [class*="menu--"],
html.unicorn .ls-root [class*="menu--"] {
  background-color: var(--card) !important;
  border-left: 1px solid var(--border) !important;
  color: var(--foreground) !important;
}
html.dark .ls-root [class*="menu--"] *,
html.unicorn .ls-root [class*="menu--"] * {
  border-color: var(--border) !important;
}

html.dark .ls-root .lsf-sidepanel,
html.unicorn .ls-root .lsf-sidepanel,
html.dark .ls-root .lsf-panel,
html.unicorn .ls-root .lsf-panel,
html.dark .ls-root .lsf-region-item,
html.unicorn .ls-root .lsf-region-item,
html.dark .ls-root .lsf-history,
html.unicorn .ls-root .lsf-history,
html.dark .ls-root .lsf-annotations,
html.unicorn .ls-root .lsf-annotations,
html.dark .ls-root .lsf-sidebar,
html.unicorn .ls-root .lsf-sidebar,
html.dark .ls-root .lsf-empty-state,
html.unicorn .ls-root .lsf-empty-state {
  background-color: var(--card) !important;
  color: var(--foreground) !important;
}

html.dark .ls-root .lsf-region-item_selected,
html.unicorn .ls-root .lsf-region-item_selected {
  background-color: var(--accent) !important;
  color: var(--accent-foreground) !important;
}

html.dark .ls-root .lsf-labels,
html.unicorn .ls-root .lsf-labels {
  background-color: transparent !important;
  border-top: 1px solid var(--border) !important;
}

html.dark .ls-root .lsf-toolbar,
html.unicorn .ls-root .lsf-toolbar,
html.dark .ls-root [class*="toolbar--"],
html.unicorn .ls-root [class*="toolbar--"] {
  background-color: var(--card) !important;
  border: 1px solid var(--border) !important;
  color: var(--foreground) !important;
}
html.dark .ls-root .lsf-toolbar *,
html.unicorn .ls-root .lsf-toolbar *,
html.dark .ls-root [class*="toolbar--"] *,
html.unicorn .ls-root [class*="toolbar--"] * {
  color: var(--foreground) !important;
  border-color: var(--border) !important;
}
html.dark .ls-root .lsf-toolbar svg *,
html.unicorn .ls-root .lsf-toolbar svg *,
html.dark .ls-root [class*="toolbar--"] svg *,
html.unicorn .ls-root [class*="toolbar--"] svg * {
  fill: var(--foreground) !important;
}

/* Tooltip popovers and shortcut keys for toolbar in dark/unicorn themes */
html.dark .ls-root .lsf-tool__tooltip-body,
html.unicorn .ls-root .lsf-tool__tooltip-body {
  background-color: var(--popover) !important;
  color: var(--popover-foreground) !important;
  border: 1px solid var(--border) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}
html.dark .ls-root .lsf-tool__tooltip-body *,
html.unicorn .ls-root .lsf-tool__tooltip-body * {
  color: var(--popover-foreground) !important;
}
html.dark .ls-root .lsf-tool__key,
html.unicorn .ls-root .lsf-tool__key {
  background-color: var(--secondary) !important;
  color: var(--secondary-foreground) !important;
  border: 1px solid var(--border) !important;
  box-shadow: none !important;
}
html.dark .ls-root .lsf-tool__key *,
html.unicorn .ls-root .lsf-tool__key * {
  color: var(--secondary-foreground) !important;
}

/* Ensure keyboard shortcut badges use a clean monospace font in all themes */
.ls-root .lsf-tool__key,
.ls-root .lsf-keys__key,
.ls-root .lsf-tool__key *,
.ls-root .lsf-keys__key * {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  font-weight: 600 !important;
  font-size: 11px !important;
}

/* Auto-annotation controls topbar theme overrides */
.lsf-dynamic-preannotations {
  padding: 0 16px !important;
}
html.dark .lsf-dynamic-preannotations,
html.unicorn .lsf-dynamic-preannotations {
  background-color: var(--card) !important;
  color: var(--foreground) !important;
  border-bottom: 1px solid var(--border) !important;
}
html.dark .lsf-dynamic-preannotations *,
html.unicorn .lsf-dynamic-preannotations * {
  color: var(--foreground) !important;
}

/* Ensure the toggle and its text label sit inline and do not overlap */
.lsf-dynamic-preannotations .lsf-field-label_placement_right {
  display: flex !important;
  flex-direction: row-reverse !important;
  align-items: center !important;
  gap: 8px !important;
}
.lsf-dynamic-preannotations .lsf-field-label__text {
  padding: 0 !important;
  margin: 0 !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}

/* Auto-annotation settings dropdown theme and layout overrides (without .ls-root to match portal wrappers) */
html.dark .lsf-dynamic-preannotations-control,
html.unicorn .lsf-dynamic-preannotations-control {
  background-color: var(--card) !important;
  color: var(--foreground) !important;
  border: 1px solid var(--border) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}
html.dark .lsf-dynamic-preannotations-control *,
html.unicorn .lsf-dynamic-preannotations-control * {
  color: var(--foreground) !important;
}
.lsf-dynamic-preannotations-control {
  display: none !important;
}
#ei-auto-accept-wrapper {
  display: flex !important;
  align-items: center !important;
}
.ei-auto-accept-label {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--foreground) !important;
  cursor: pointer !important;
  user-select: none !important;
  margin-left: 20px !important;
  padding: 4px 8px !important;
  border-radius: 4px !important;
  background-color: transparent !important;
  transition: background-color 0.15s ease !important;
}
.ei-auto-accept-label:hover {
  background-color: var(--accent) !important;
}
.ei-auto-accept-label input[type="checkbox"] {
  accent-color: var(--primary) !important;
  width: 14px !important;
  height: 14px !important;
  cursor: pointer !important;
}
/* <Header> tag text — LS renders it as a heading whose default color is dark,
   leaving the SAM mode hints near-invisible on a dark canvas. Make them readable. */
html.dark .ls-root :is(h1, h2, h3, h4, h5, h6),
html.unicorn .ls-root :is(h1, h2, h3, h4, h5, h6) {
  color: var(--foreground) !important;
}

/* Override Label Studio heading sizes to make them clean, modern, and readable */
.ls-root h1 {
  font-size: 20px !important;
  font-weight: 600 !important;
}
.ls-root h2 {
  font-size: 16px !important;
  font-weight: 600 !important;
}
.ls-root :is(h3, h4, h5, h6, .lsf-header) {
  font-size: 14px !important;
  font-weight: 600 !important;
  margin-top: 14px !important;
  margin-bottom: 6px !important;
}

/* Custom toggles (lsf-toggle) theme overrides */
html.dark .ls-root .lsf-toggle,
html.unicorn .ls-root .lsf-toggle {
  background: var(--muted) !important;
  color: var(--primary) !important;
  box-shadow: inset 0 0 0 1px var(--border) !important;
}
html.dark .ls-root .lsf-toggle__indicator:before,
html.unicorn .ls-root .lsf-toggle__indicator:before {
  background: var(--foreground) !important;
  box-shadow: none !important;
}
html.dark .ls-root .lsf-toggle_checked .lsf-toggle__indicator:before,
html.unicorn .ls-root .lsf-toggle_checked .lsf-toggle__indicator:before {
  background: var(--primary-foreground) !important;
}

/* Vertical slider controls popover layout and alignment overrides */
.ls-root .lsf-tool__controls-body {
  height: auto !important;
  min-height: 120px !important;
  width: 32px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 10px 0 !important;
  box-sizing: border-box !important;
}
.ls-root .lsf-tool__controls-body .ant-slider-vertical {
  height: 100px !important;
  margin: 0 !important;
  padding: 0 !important;
}

html.dark .ls-root .lsf-tool__controls-body,
html.unicorn .ls-root .lsf-tool__controls-body {
  background-color: var(--card) !important;
  color: var(--foreground) !important;
  border: 1px solid var(--border) !important;
}

/* Ant Design Checkbox theme overrides */
html.dark .ls-root .ant-checkbox-inner,
html.unicorn .ls-root .ant-checkbox-inner {
  background-color: var(--secondary) !important;
  border-color: var(--border) !important;
}
html.dark .ls-root .ant-checkbox-checked .ant-checkbox-inner,
html.unicorn .ls-root .ant-checkbox-checked .ant-checkbox-inner {
  background-color: var(--primary) !important;
  border-color: var(--primary) !important;
}

/* Ant Design Slider theme overrides */
html.dark .ls-root .ant-slider-rail,
html.unicorn .ls-root .ant-slider-rail {
  background-color: var(--secondary) !important;
}
html.dark .ls-root .ant-slider-track {
  background-color: var(--primary) !important;
}
html.dark .ls-root .ant-slider-handle,
html.unicorn .ls-root .ant-slider-handle {
  border-color: var(--primary) !important;
  background-color: var(--card) !important;
}
html.dark .ls-root .ant-slider-handle:hover,
html.dark .ls-root .ant-slider-handle:focus,
html.unicorn .ls-root .ant-slider-handle:hover,
html.unicorn .ls-root .ant-slider-handle:focus {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 30%, transparent) !important;
}
html.unicorn .ls-root .ant-slider-track {
  background-image: linear-gradient(
    to bottom,
    oklch(0.66 0.24 350),
    oklch(0.62 0.2 285)
  ) !important;
}

/* Ant Design (antd) component theme overrides inside the iframe */
html.dark .ls-root .ant-tabs,
html.unicorn .ls-root .ant-tabs,
html.dark .ls-root .ant-tabs-nav,
html.unicorn .ls-root .ant-tabs-nav,
html.dark .ls-root .ant-tabs-tab,
html.unicorn .ls-root .ant-tabs-tab,
html.dark .ls-root .ant-tabs-content,
html.unicorn .ls-root .ant-tabs-content,
html.dark .ls-root .ant-tabs-tabpane,
html.unicorn .ls-root .ant-tabs-tabpane,
html.dark .ls-root .ant-tabs-content-holder,
html.unicorn .ls-root .ant-tabs-content-holder,
html.dark .ls-root .ant-card,
html.unicorn .ls-root .ant-card,
html.dark .ls-root .ant-card-body,
html.unicorn .ls-root .ant-card-body,
html.dark .ls-root .ant-list,
html.unicorn .ls-root .ant-list,
html.dark .ls-root .ant-list-item,
html.unicorn .ls-root .ant-list-item,
html.dark .ls-root [class*="lstitem--"],
html.unicorn .ls-root [class*="lstitem--"] {
  background-color: transparent !important;
  background: transparent !important;
  border-color: var(--border) !important;
  color: var(--foreground) !important;
}

/* Ant Design Tree overrides */
html.dark .ls-root .ant-tree,
html.unicorn .ls-root .ant-tree,
html.dark .ls-root .ant-tree-list,
html.unicorn .ls-root .ant-tree-list,
html.dark .ls-root .ant-tree-list-holder,
html.unicorn .ls-root .ant-tree-list-holder,
html.dark .ls-root .ant-tree-list-holder-inner,
html.unicorn .ls-root .ant-tree-list-holder-inner,
html.dark .ls-root .ant-tree-treenode,
html.unicorn .ls-root .ant-tree-treenode,
html.dark .ls-root .ant-tree-node-content-wrapper,
html.unicorn .ls-root .ant-tree-node-content-wrapper,
html.dark .ls-root .ant-tree-title,
html.unicorn .ls-root .ant-tree-title {
  background-color: transparent !important;
  background: transparent !important;
  color: var(--foreground) !important;
}

html.dark .ls-root .ant-tree-node-content-wrapper:hover,
html.unicorn .ls-root .ant-tree-node-content-wrapper:hover {
  background-color: var(--accent) !important;
}

html.dark .ls-root .ant-tabs-tab-btn,
html.unicorn .ls-root .ant-tabs-tab-btn {
  color: var(--muted-foreground) !important;
}
html.dark .ls-root .ant-tabs-tab-active .ant-tabs-tab-btn,
html.unicorn .ls-root .ant-tabs-tab-active .ant-tabs-tab-btn {
  color: var(--primary) !important;
}

html.dark .ls-root .ant-checkbox-wrapper,
html.unicorn .ls-root .ant-checkbox-wrapper,
html.dark .ls-root .ant-radio-wrapper,
html.unicorn .ls-root .ant-radio-wrapper {
  color: var(--foreground) !important;
}

/* Radio group tab-style buttons and sort headers */
html.dark .ls-root .lsf-radio-group,
html.unicorn .ls-root .lsf-radio-group {
  background: var(--secondary) !important;
  border: 1px solid var(--border) !important;
  box-shadow: none !important;
}
html.dark .ls-root .lsf-radio-group__button,
html.unicorn .ls-root .lsf-radio-group__button {
  background-color: transparent !important;
  color: var(--muted-foreground) !important;
  border-color: transparent !important;
}
html.dark .ls-root .lsf-radio-group__button_checked,
html.unicorn .ls-root .lsf-radio-group__button_checked {
  background-color: var(--primary) !important;
  color: var(--primary-foreground) !important;
}

/* Sidebar toggle tabs overrides */
html.dark .ls-root .lsf-sidebar-tabs__toggle,
html.unicorn .ls-root .lsf-sidebar-tabs__toggle {
  background-color: var(--secondary) !important;
  border-bottom: 1px solid var(--border) !important;
}
html.dark .ls-root .lsf-sidebar-tabs__tab,
html.unicorn .ls-root .lsf-sidebar-tabs__tab {
  color: var(--muted-foreground) !important;
  box-shadow: none !important;
  background-color: transparent !important;
}
html.dark .ls-root .lsf-sidebar-tabs__tab_active,
html.unicorn .ls-root .lsf-sidebar-tabs__tab_active {
  background-color: var(--card) !important;
  color: var(--foreground) !important;
  box-shadow: none !important;
}

/* Global button overrides for dark and unicorn themes */
html.dark .ls-root .lsf-button,
html.unicorn .ls-root .lsf-button {
  background-color: var(--secondary) !important;
  color: var(--foreground) !important;
  box-shadow: none !important;
  border: 1px solid var(--border) !important;
}
html.dark .ls-root .lsf-button:hover,
html.unicorn .ls-root .lsf-button:hover {
  background-color: var(--accent) !important;
  color: var(--accent-foreground) !important;
}
html.dark .ls-root .lsf-button:disabled,
html.unicorn .ls-root .lsf-button:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}
html.dark .ls-root .lsf-button_look_primary,
html.unicorn .ls-root .lsf-button_look_primary {
  background-color: var(--primary) !important;
  color: var(--primary-foreground) !important;
  border: none !important;
}
html.dark .ls-root .lsf-button_look_primary:hover,
html.unicorn .ls-root .lsf-button_look_primary:hover {
  background-color: color-mix(in oklch, var(--primary) 85%, black) !important;
  color: var(--primary-foreground) !important;
}
html.dark .ls-root .lsf-entities__counter,
html.unicorn .ls-root .lsf-entities__counter {
  color: inherit !important;
  background: transparent !important;
}
html.dark .ls-root .lsf-entities__sort,
html.unicorn .ls-root .lsf-entities__sort {
  color: var(--foreground) !important;
}

/* Label badges / choice buttons - Preserve dynamic background and left border colors, only override text and hotkey colors for dark mode */
html.dark .ls-root .lsf-label__text,
html.dark .ls-root .lsf-label__hotkey {
  color: #ffffff !important;
}

/* Region list items description, counter, toggle eye, and bounding box icon overrides for dark/unicorn modes */
html.dark .ls-root .lsf-region-item__desc,
html.unicorn .ls-root .lsf-region-item__desc {
  background-color: var(--background) !important;
  border-color: var(--border) !important;
  color: var(--foreground) !important;
}
html.dark .ls-root [class*="labels--"],
html.unicorn .ls-root [class*="labels--"] {
  color: var(--foreground) !important;
}
html.dark .ls-root .lsf-region-item__counter,
html.unicorn .ls-root .lsf-region-item__counter {
  color: var(--muted-foreground) !important;
}
html.dark .ls-root .lsf-region-item__toggle svg,
html.unicorn .ls-root .lsf-region-item__toggle svg,
html.dark .ls-root .lsf-region-item__collapse svg,
html.unicorn .ls-root .lsf-region-item__collapse svg,
html.dark .ls-root .lsf-entities__visibility svg,
html.unicorn .ls-root .lsf-entities__visibility svg {
  color: var(--foreground) !important;
  opacity: 0.7 !important;
}
html.dark .ls-root .lsf-region-item__id svg,
html.unicorn .ls-root .lsf-region-item__id svg {
  color: var(--labelColor, var(--foreground)) !important;
  opacity: 0.8 !important;
}
html.dark .ls-root .lsf-region-item__collapse,
html.unicorn .ls-root .lsf-region-item__collapse {
  opacity: 0.7 !important;
}
html.dark .ls-root .lsf-region-item__collapse:hover,
html.unicorn .ls-root .lsf-region-item__collapse:hover {
  opacity: 1 !important;
}
html.dark .ls-root .lsf-region-item__toggle svg *,
html.unicorn .ls-root .lsf-region-item__toggle svg *,
html.dark .ls-root .lsf-region-item__collapse svg *,
html.unicorn .ls-root .lsf-region-item__collapse svg *,
html.dark .ls-root .lsf-entities__visibility svg *,
html.unicorn .ls-root .lsf-entities__visibility svg * {
  stroke: var(--foreground) !important;
  opacity: 1 !important;
}
html.dark .ls-root .lsf-region-item__toggle:hover svg,
html.unicorn .ls-root .lsf-region-item__toggle:hover svg,
html.dark .ls-root .lsf-region-item__collapse:hover svg,
html.unicorn .ls-root .lsf-region-item__collapse:hover svg,
html.dark .ls-root .lsf-entities__visibility:hover svg,
html.unicorn .ls-root .lsf-entities__visibility:hover svg {
  opacity: 1 !important;
}

/* Ant Design Dropdown and Select Menu overrides for dark and unicorn themes */
html.dark .ant-dropdown-menu,
html.unicorn .ant-dropdown-menu,
html.dark .ant-select-dropdown,
html.unicorn .ant-select-dropdown {
  background-color: var(--card) !important;
  border: 1px solid var(--border) !important;
  padding: 4px !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

html.dark .ant-dropdown-menu-item,
html.unicorn .ant-dropdown-menu-item,
html.dark .ant-select-item-option,
html.unicorn .ant-select-item-option {
  color: var(--foreground) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border-radius: 6px !important;
  padding: 6px 12px !important;
  line-height: 1.4 !important;
}

/* Hover / Active state */
html.dark .ant-dropdown-menu-item:hover,
html.unicorn .ant-dropdown-menu-item:hover,
html.dark .ant-select-item-option-active,
html.unicorn .ant-select-item-option-active {
  background-color: var(--accent) !important;
  color: var(--accent-foreground) !important;
}

/* Selected state in dark mode */
html.dark .ant-dropdown-menu-item-selected,
html.dark .ant-select-item-option-selected {
  background-color: var(--primary) !important;
  color: var(--primary-foreground) !important;
}

/* Selected state in unicorn mode */
html.unicorn .ant-dropdown-menu-item-selected,
html.unicorn .ant-select-item-option-selected {
  background-color: color-mix(in oklch, var(--primary) 15%, transparent) !important;
  color: var(--primary) !important;
}

/* Selected item hover */
html.dark .ant-dropdown-menu-item-selected:hover,
html.dark .ant-select-item-option-selected:hover {
  background-color: var(--primary) !important;
  color: var(--primary-foreground) !important;
}
html.unicorn .ant-dropdown-menu-item-selected:hover,
html.unicorn .ant-select-item-option-selected:hover {
  background-color: color-mix(in oklch, var(--primary) 25%, transparent) !important;
  color: var(--primary) !important;
}

/* Normalize font sizes for all sort menu components and their icons/text */
.ant-dropdown-menu-item,
.lsf-sort-menu__option-inner,
.lsf-sort-menu__title,
.lsf-sort-menu__title * {
  font-size: 13px !important;
  font-weight: 500 !important;
}

.lsf-sort-menu__icon,
.lsf-sort-menu__icon * {
  font-size: 13px !important;
  width: 14px !important;
  height: 14px !important;
}

/* Normalize the sort trigger button size */
.ls-root .lsf-entities__sort,
.ls-root .lsf-entities__sort * {
  font-size: 13px !important;
  font-weight: 500 !important;
}

/* Unicorn theme decorative primary button elements */
.unicorn .lsf-controls .lsf-button_look_primary {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
}
.unicorn .lsf-controls .lsf-button_look_primary::after {
  content: "🦄" !important;
  position: static !important;
  font-size: 16px !important;
  display: inline-block !important;
  pointer-events: none !important;
  animation: unicorn-float 6s ease-in-out infinite !important;
  transform-origin: center !important;
}
@keyframes unicorn-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@media (prefers-reduced-motion: reduce) {
  .unicorn .lsf-controls .lsf-button_look_primary::after {
    animation: none !important;
  }
}

/* Force the Label Studio editor container to fill the viewport and override any default mobile max-width/margins and column wrapping */
.ls-root .ls-editor,
.ls-root [class*="editor--"] {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  flex-wrap: nowrap !important;
}

/* Overrides for Label Studio error containers (e.g. .error--O7ftV) to match the app's theme */
.ls-root [class*="error--"] {
  background-color: color-mix(in oklch, var(--destructive) 15%, var(--card)) !important;
  border: 1px solid color-mix(in oklch, var(--destructive) 30%, var(--border)) !important;
  color: var(--foreground) !important;
  border-radius: var(--radius, 6px) !important;
  font-family: inherit !important;
}

.ls-root [class*="error--"] code {
  background-color: color-mix(in oklch, var(--destructive) 25%, var(--card)) !important;
  color: color-mix(in oklch, var(--destructive) 85%, var(--foreground)) !important;
  border: 1px solid color-mix(in oklch, var(--destructive) 40%, var(--border)) !important;
  padding: 2px 4px !important;
  border-radius: 4px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
}

.ls-root [class*="error--"] a {
  color: var(--primary) !important;
  text-decoration: underline !important;
  font-weight: 500 !important;
}

.ls-root [class*="error--"] a:hover {
  color: color-mix(in oklch, var(--primary) 85%, black) !important;
}

/* Typographical and header overrides for dark/unicorn modes to ensure good readability */
html.dark .ls-root h1, html.dark .ls-root h2, html.dark .ls-root h3,
html.dark .ls-root h4, html.dark .ls-root h5, html.dark .ls-root h6,
html.dark .ls-root .ant-typography,
html.unicorn .ls-root h1, html.unicorn .ls-root h2, html.unicorn .ls-root h3,
html.unicorn .ls-root h4, html.unicorn .ls-root h5, html.unicorn .ls-root h6,
html.unicorn .ls-root .ant-typography {
  color: var(--foreground) !important;
}

/* Custom centered prediction/SAM loader styles */
#ei-sam-loader {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  background-color: rgba(255, 255, 255, 0.85) !important;
  backdrop-filter: blur(4px) !important;
  border: 1px solid var(--border) !important;
  padding: 12px 20px !important;
  border-radius: 9999px !important;
  display: none;
  align-items: center !important;
  gap: 10px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
  z-index: 9999 !important;
  pointer-events: none !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: #111111 !important;
  font-family: sans-serif !important;
}
html.dark #ei-sam-loader,
html.unicorn #ei-sam-loader {
  background-color: rgba(30, 30, 40, 0.85) !important;
  color: #eeeeee !important;
}
.ei-sam-spinner {
  width: 16px !important;
  height: 16px !important;
  border: 2px solid var(--primary) !important;
  border-top-color: transparent !important;
  border-radius: 50% !important;
  animation: ei-spin 0.6s linear infinite !important;
}
@keyframes ei-spin {
  to {
    transform: rotate(360deg);
  }
}
body.ei-sam-loading,
body.ei-sam-loading * {
  cursor: wait !important;
}
`;

function injectTheme() {
  let style = document.getElementById("ls-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "ls-theme";
  }
  style.textContent = LS_THEME;
  document.head.appendChild(style);
}

const INTERFACES = [
  "panel",
  "update",
  "submit",
  "skip",
  "controls",
  "topbar",
  "instruction",
  "side-column",
  "annotations:current",
  "auto-annotation",
  "predictions:menu",
];

export default function LabelerEmbed() {
  const rootRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LSInstance | null>(null);

  useEffect(() => {
    // ---------------------------------------------------------------------------
    // AGGRESSIVE scroll-prevention: Label Studio's bundle uses many different
    // DOM APIs to scroll (scrollIntoView, Element.scroll/scrollTo, direct
    // scrollTop assignment, window.scroll*, focus). We block ALL of them
    // unconditionally inside this iframe to stop the page from jumping when a
    // bounding box is selected (which triggers sidebar highlight + scrollIntoView).
    // ---------------------------------------------------------------------------

    const origin = window.location.origin;
    const post = (type: string, annotation?: unknown) =>
      window.parent.postMessage({ source: "ls-embed", type, annotation }, origin);

    const originalFetch = window.fetch;
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    let activeSessionToken: string | null = null;

    function withSessionHeader(init?: RequestInit): RequestInit | undefined {
      if (!activeSessionToken) return init;
      const headers = new Headers(init?.headers);
      headers.set("x-ei-session-token", activeSessionToken);
      return { ...init, headers };
    }

    window.fetch = async function (input, init) {
      let urlStr = "";
      if (typeof input === "string") {
        urlStr = input;
      } else if (input instanceof URL) {
        urlStr = input.toString();
      } else if (input && typeof input === "object" && "url" in input) {
        urlStr = (input as any).url;
      }
      if (urlStr && (urlStr.includes("/predict") || urlStr.includes("/predictions"))) {
        const redirectUrl = "/api/ei/predict";
        try {
          const res = await originalFetch(redirectUrl, withSessionHeader(init));
          if (!res.ok) {
            const cloned = res.clone();
            cloned.json().then(data => {
              const errMsg = data && data.error ? data.error : `Status ${res.status}`;
              post("error", `Auto-Annotation failed: ${errMsg}`);
            }).catch(() => {
              cloned.text().then(text => {
                post("error", `Auto-Annotation failed: ${text || res.statusText}`);
              });
            });
          }
          return res;
        } catch (err: any) {
          post("error", `Auto-Annotation network error: ${err?.message || String(err)}`);
          throw err;
        }
      }
      return originalFetch(input, init);
    };

    (XMLHttpRequest.prototype.open as any) = function (this: XMLHttpRequest, method: string, url: string | URL, ...args: any[]) {
      let targetUrl = url;
      if (typeof url === "string" && (url.includes("/predict") || url.includes("/predictions"))) {
        targetUrl = "/api/ei/predict";
        const originalSend = this.send;
        this.send = function (...sendArgs: any[]) {
          if (activeSessionToken) this.setRequestHeader("x-ei-session-token", activeSessionToken);
          return originalSend.apply(this, sendArgs as [Document | XMLHttpRequestBodyInit | null | undefined]);
        };
        const originalOnReadyStateChange = this.onreadystatechange;
        this.onreadystatechange = function (e) {
          if (this.readyState === 4) {
            if (this.status >= 400 || this.status === 0) {
              try {
                const data = JSON.parse(this.responseText);
                post("error", `Auto-Annotation failed: ${data.error || "Status " + this.status}`);
              } catch {
                post("error", `Auto-Annotation failed with status ${this.status || "connection refused"}. Is the ML backend running?`);
              }
            }
          }
          if (originalOnReadyStateChange) originalOnReadyStateChange.call(this, e);
        };
      }
      return (originalXhrOpen as any).call(this, method, targetUrl, ...args);
    };

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollIntoViewIfNeeded = (Element.prototype as any).scrollIntoViewIfNeeded;
    const originalFocus = HTMLElement.prototype.focus;
    const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    const originalScrollTopSetter = originalScrollTopDescriptor?.set;
    const originalScrollLeftDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft");
    const originalScrollLeftSetter = originalScrollLeftDescriptor?.set;
    const originalWindowScrollTo = window.scrollTo;
    const originalWindowScroll = window.scroll;
    const originalWindowScrollBy = window.scrollBy;
    const originalElementScrollTo = Element.prototype.scrollTo;
    const originalElementScroll = Element.prototype.scroll;

    // Helper: is this element the document root (body or <html>)?
    const isDocRoot = (el: Element) =>
      el === document.body || el === document.documentElement;

    // Block ALL scrollIntoView calls unconditionally.  Label Studio calls this
    // on region-item elements, focused inputs, even canvas helpers — any of
    // which can cascade a body scroll in a stacked (mobile) layout.
    Element.prototype.scrollIntoView = function () {
      // completely suppressed
    };

    if (originalScrollIntoViewIfNeeded) {
      (Element.prototype as any).scrollIntoViewIfNeeded = function () {
        // completely suppressed
      };
    }

    // Block Element.prototype.scrollTo and .scroll on body/documentElement.
    // Label Studio calls `container.scroll({top, left, behavior})` directly.
    if (originalElementScrollTo) {
      Element.prototype.scrollTo = function (...args: any[]) {
        if (isDocRoot(this)) return;
        return originalElementScrollTo.apply(this, args as any);
      };
    }
    if (originalElementScroll) {
      Element.prototype.scroll = function (...args: any[]) {
        if (isDocRoot(this)) return;
        return originalElementScroll.apply(this, args as any);
      };
    }

    // Force preventScroll on ALL focus calls.
    HTMLElement.prototype.focus = function (options) {
      return originalFocus.call(this, { ...options, preventScroll: true });
    };

    // Block scrollTop writes on body/documentElement.
    if (originalScrollTopSetter) {
      Object.defineProperty(Element.prototype, "scrollTop", {
        configurable: true,
        set: function (value) {
          if (isDocRoot(this)) return;
          return originalScrollTopSetter.call(this, value);
        },
        get: originalScrollTopDescriptor?.get,
      });
    }

    // Block scrollLeft writes on body/documentElement.
    if (originalScrollLeftSetter) {
      Object.defineProperty(Element.prototype, "scrollLeft", {
        configurable: true,
        set: function (value) {
          if (isDocRoot(this)) return;
          return originalScrollLeftSetter.call(this, value);
        },
        get: originalScrollLeftDescriptor?.get,
      });
    }

    // Block all window-level scroll methods.
    window.scrollTo = function () {};
    window.scroll = function () {};
    window.scrollBy = function () {};

    function onError(e: ErrorEvent) {
      post("error", e.message);
    }
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      post("error", e.reason?.message || String(e.reason));
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    function setTheme(theme: string) {
      const el = document.documentElement;
      el.classList.remove("light", "dark", "unicorn");
      if (theme) el.classList.add(theme);
    }

    // Set the initial theme from query parameters on mount to avoid race conditions
    const params = getIframeQueryParams();
    const initialTheme = params.get("theme");
    if (initialTheme) {
      setTheme(initialTheme);
    }

    // Reset body layout inside the iframe to prevent Next.js root layout flex rules
    // from causing alignment offsets in the Label Studio canvas.
    document.body.className = "bg-background text-foreground";
    document.body.style.display = "block";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";
    document.body.style.width = "100%";
    document.body.style.height = "100%";

    // Inject the theme stylesheet on mount so it is active before Label Studio builds its DOM
    injectTheme();

    // Start downloading + parsing the (large) Label Studio bundle right away,
    // overlapping the host's render handshake and the samples fetch instead of
    // waiting for the first "render" message. Idempotent — render() reuses the
    // same in-flight promise, so this only warms the global ahead of time.
    void loadLabelStudio().catch(() => {
      /* a real failure is surfaced when render() is actually attempted */
    });

    function sessionHeaders(sessionToken?: string | null): HeadersInit {
      return sessionToken ? { "x-ei-session-token": sessionToken } : {};
    }

    function render(
      config: string,
      task: LSTask,
      opts?: { autoAnnotate?: boolean; autoAccept?: boolean; sessionToken?: string | null },
    ) {
      activeSessionToken = opts?.sessionToken ?? null;
      if (task?.data?.image) {
        const warmupBody = {
          action: "warmup",
          tasks: [{ data: task.data }],
          label_config: config,
        };
        console.log("[SAM] Triggering background warmup/pre-embedding for image:", task.data.image);
        originalFetch("/api/ei/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...sessionHeaders(opts?.sessionToken) },
          body: JSON.stringify(warmupBody),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          console.log("[SAM] Background warmup response:", res.status, data);
        }).catch((err) => {
          console.error("[SAM] Background warmup failed to fetch:", err);
        });
      }

      loadLabelStudio()
        .then((LabelStudioCtor) => {
          if (!rootRef.current) return;
          instanceRef.current?.destroy?.();
          rootRef.current.innerHTML = "";
          instanceRef.current = new LabelStudioCtor(rootRef.current, {
            config,
            task,
            interfaces: INTERFACES,
            user: { pk: 1, firstName: "Labeler" },
            onSubmitAnnotation: (_ls: unknown, a: unknown) => post("submit", serializeAnnotation(a)),
            onUpdateAnnotation: (_ls: unknown, a: unknown) => post("submit", serializeAnnotation(a)),
            onSkipTask: () => post("skip"),
          });

          // Interactive ML (SAM): standalone LSF fires the `regionFinishedDrawing`
          // event when a smart-tool region is placed and expects the host to feed
          // predictions via store.loadSuggestions(promise, transform). It does NOT
          // fetch /predict on its own, so wiring this event is what actually drives
          // Point2Label / Bbox2Label.
          const ls = instanceRef.current as any;
          if (ls?.on) {
            console.log(
              "[SAM] interactive ML wired — listening for regionFinishedDrawing.",
              "store?", !!ls.store, "loadSuggestions?", !!ls.store?.loadSuggestions,
            );
            ls.on("regionFinishedDrawing", (...args: any[]) => {
              console.log("[SAM] regionFinishedDrawing fired with", args.length, "arg(s)");
              try {
                const region =
                  args.find((a) => a && (a.results || a.type || a.serialize)) ?? args[1] ?? args[0];
                const store = ls.store;
                const annotation = store?.annotationStore?.selected;
                if (!annotation) return;
                const all: any[] = annotation.serializeAnnotation?.() ?? [];
                const isSmart = (r: any) =>
                  r?.type === "keypointlabels" || r?.type === "rectanglelabels";
                const match = region?.id ? all.find((r) => r.id === region.id) : null;
                const chosen = match ? [match] : all.filter(isSmart).slice(-1);
                // The OpenMMLab backend reads value.labels for keypoints; serialized
                // smart regions only carry value.keypointlabels, so mirror it.
                const result = chosen.map((r: any) => {
                  const value = { ...r.value };
                  if (r.type === "keypointlabels" && value.keypointlabels && !value.labels)
                    value.labels = value.keypointlabels;
                  return { ...r, value };
                });
                console.log("[SAM] regionFinishedDrawing → context", result);
                if (!result.length) return;
                const ow = result[0]?.original_width;
                const oh = result[0]?.original_height;
                const reqBody = {
                  tasks: [{ data: task.data }],
                  label_config: config,
                  params: { context: { result } },
                };
                // Show loader spinner and set wait cursor
                let loader = document.getElementById("ei-sam-loader");
                if (!loader) {
                  loader = document.createElement("div");
                  loader.id = "ei-sam-loader";
                  loader.innerHTML = `
                    <div class="ei-sam-spinner"></div>
                    <span>Segmenting...</span>
                  `;
                  const mainView = document.querySelector(".lsf-main-view") || document.body;
                  mainView.appendChild(loader);
                }
                loader.style.display = "flex";
                document.body.classList.add("ei-sam-loading");

                const promise = originalFetch("/api/ei/predict", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...sessionHeaders(opts?.sessionToken) },
                  body: JSON.stringify(reqBody),
                }).then(async (res) => {
                  const data = await res.json().catch(() => ({}));
                  console.log("[SAM] /api/ei/predict", res.status, data);
                  if (!res.ok) {
                    post("error", "Auto-Annotation failed: " + (data?.error || res.status));
                    return { results: [] };
                  }
                  return data;
                }).catch((err) => {
                  console.error("[SAM] predict fetch error", err);
                  post("error", "Auto-Annotation failed: network error");
                  return { results: [] };
                }).finally(() => {
                  const el = document.getElementById("ei-sam-loader");
                  if (el) el.style.display = "none";
                  document.body.classList.remove("ei-sam-loading");
                });
                // Backend bbox/brush results omit original_width/height; add them back
                // so the suggestions render and map correctly.
                const transform = (resp: any) =>
                  (resp?.results?.[0]?.result ?? []).map((r: any) => ({
                    original_width: ow,
                    original_height: oh,
                    image_rotation: 0,
                    ...r,
                  }));
                const load =
                  store.loadSuggestions?.bind(store) ?? annotation.loadSuggestions?.bind(annotation);
                if (load) load(promise, transform);
                else console.warn("[SAM] no loadSuggestions() available on store/annotation");
              } catch (e: any) {
                post("error", "Auto-Annotation failed: " + (e?.message ?? String(e)));
              }
            });
          } else {
            console.warn("[SAM] LabelStudio instance exposes no .on(); interactive ML unwired");
          }

          // Seed the Auto-Annotation toggle + auto-accept-suggestions from URL presets.
          let seedRetries = 0;
          const seedFlags = () => {
            const currentLs = instanceRef.current as any;
            const store = currentLs?.store;
            if (store) {
              console.log("[SAM] store found, seeding flags...", {
                autoAnnotate: opts?.autoAnnotate,
                autoAccept: opts?.autoAccept,
              });
              if (opts?.autoAnnotate && typeof store.setAutoAnnotation === "function") {
                store.setAutoAnnotation(true);
              }
              if (opts?.autoAccept && typeof store.setAutoAcceptSuggestions === "function") {
                store.setAutoAcceptSuggestions(true);
              }
            } else if (seedRetries < 50) {
              seedRetries++;
              setTimeout(seedFlags, 30);
            }
          };
          seedFlags();

          injectTheme();
        })
        .catch((e) => {
          post("error", e.message || "Failed to load Label Studio bundles");
          if (rootRef.current) {
            rootRef.current.innerHTML =
              '<div style="padding:2rem;text-align:center;color:#888;font-family:sans-serif">Could not load the labeling canvas.</div>';
          }
        });
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      const d = e.data;
      if (d?.source === "ls-host") {
        if (d.type === "render") {
          if (d.theme) setTheme(d.theme);
          render(d.config, d.task, {
            autoAnnotate: d.autoAnnotate,
            autoAccept: d.autoAccept,
            sessionToken: d.sessionToken,
          });
        } else if (d.type === "theme") {
          setTheme(d.theme);
        }
      }
    }

    // Focus lives inside this iframe while labeling, so forward sample-nav keys
    // ([ and ]) up to the host — otherwise the parent never sees them.
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "[") window.parent.postMessage({ source: "ls-embed", type: "nav", dir: -1 }, origin);
      else if (e.key === "]") window.parent.postMessage({ source: "ls-embed", type: "nav", dir: 1 }, origin);
    }

    // Inline custom checkbox injection next to the Auto-Annotation toggle
    const injectCustomCheckbox = () => {
      const toggle = document.querySelector(".lsf-dynamic-preannotations .lsf-toggle");
      const parent = toggle?.closest(".lsf-field-label_placement_right");
      if (!parent || document.getElementById("ei-auto-accept-wrapper")) return;

      const wrapper = document.createElement("div");
      wrapper.id = "ei-auto-accept-wrapper";
      wrapper.innerHTML = `
        <label class="ei-auto-accept-label">
          <input type="checkbox" id="ei-auto-accept-checkbox" />
          Auto accept
        </label>
      `;
      parent.insertBefore(wrapper, parent.firstChild);

      const checkbox = wrapper.querySelector("#ei-auto-accept-checkbox") as HTMLInputElement;
      checkbox.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        const ls = instanceRef.current as any;
        if (ls?.store?.setAutoAcceptSuggestions) {
          ls.store.setAutoAcceptSuggestions(checked);
        }
      });
    };

    const popoverObserver = new MutationObserver(injectCustomCheckbox);
    popoverObserver.observe(document.body, { childList: true, subtree: true });

    const syncInterval = setInterval(() => {
      const wrapper = document.getElementById("ei-auto-accept-wrapper");
      const ls = instanceRef.current as any;
      const autoAnnotateEnabled = ls?.store?.autoAnnotation;
      if (wrapper) {
        wrapper.style.display = autoAnnotateEnabled ? "flex" : "none";
      }

      const cb = document.getElementById("ei-auto-accept-checkbox") as HTMLInputElement | null;
      const storeVal = ls?.store?.autoAcceptSuggestions;
      if (cb && storeVal !== undefined && cb.checked !== storeVal) {
        cb.checked = storeVal;
      }

      // Auto-select the Smart Tool if auto-annotate is enabled and the tool is not active
      if (autoAnnotateEnabled) {
        const smartBtn = document.querySelector(".lsf-tool_smart") as HTMLElement | null;
        if (smartBtn && !smartBtn.classList.contains("lsf-tool_active")) {
          console.log("[SAM] Auto-selecting Smart Tool");
          smartBtn.click();
        }
      }
    }, 200);


    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown);
    post("ready");

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      popoverObserver.disconnect();
      clearInterval(syncInterval);
      Element.prototype.scrollIntoView = originalScrollIntoView;
      if (originalScrollIntoViewIfNeeded) {
        (Element.prototype as any).scrollIntoViewIfNeeded = originalScrollIntoViewIfNeeded;
      }
      Element.prototype.scrollTo = originalElementScrollTo;
      Element.prototype.scroll = originalElementScroll;
      HTMLElement.prototype.focus = originalFocus;
      if (originalScrollTopSetter && originalScrollTopDescriptor) {
        Object.defineProperty(Element.prototype, "scrollTop", originalScrollTopDescriptor);
      }
      if (originalScrollLeftSetter && originalScrollLeftDescriptor) {
        Object.defineProperty(Element.prototype, "scrollLeft", originalScrollLeftDescriptor);
      }
      window.scrollTo = originalWindowScrollTo;
      window.scroll = originalWindowScroll;
      window.scrollBy = originalWindowScrollBy;
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXhrOpen;
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, []);

  return <div ref={rootRef} className="ls-root" style={{ height: "100%", width: "100%" }} />;
}
