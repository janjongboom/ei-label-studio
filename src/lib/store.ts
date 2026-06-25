"use client";

import { create } from "zustand";
import type { EIBoundingBox, EICategory, EIProject, EISample, LabelTask, WorkMode } from "./types";
import type { UrlPreset } from "./url-params";

interface AppState {
  // connection
  connected: boolean;
  project: EIProject | null;
  // workspace config (seeded from URL presets)
  category: EICategory;
  labelFilter: string[];
  task: LabelTask | null; // null = auto-detect per sample
  mode: WorkMode;
  autoAdvance: boolean;
  autoAnnotate: boolean;
  autoAccept: boolean;
  embed: boolean;
  limit: number;
  debugSession: boolean;
  // data
  samples: EISample[];
  totalCount: number;
  activeIndex: number;
  // pending preset that should pre-fill the connect form
  preset: UrlPreset | null;

  setConnected: (project: EIProject | null) => void;
  applyPreset: (preset: UrlPreset) => void;
  setSamples: (samples: EISample[], totalCount: number) => void;
  setActiveIndex: (i: number) => void;
  setCategory: (c: EICategory) => void;
  setTask: (t: LabelTask | null) => void;
  setLabelFilter: (l: string[]) => void;
  setAutoAdvance: (v: boolean) => void;
  markLabeled: (sampleId: number, label: string, boundingBoxes?: EIBoundingBox[]) => void;
  reset: () => void;
}

const STORAGE_KEY = "ei-selected-labeling-template";

const getInitialTask = (): LabelTask | null => {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "auto") return null;
    if (val) return val as LabelTask;
  }
  return null;
};

const saveTask = (task: LabelTask | null) => {
  if (typeof window !== "undefined") {
    if (task === null) {
      localStorage.setItem(STORAGE_KEY, "auto");
    } else {
      localStorage.setItem(STORAGE_KEY, task);
    }
  }
};

export const useApp = create<AppState>((set) => ({
  connected: false,
  project: null,
  category: "training",
  labelFilter: [],
  task: getInitialTask(),
  mode: "relabel",
  autoAdvance: false,
  autoAnnotate: true,
  autoAccept: true,
  embed: false,
  limit: 200,
  debugSession: false,
  samples: [],
  totalCount: 0,
  activeIndex: 0,
  preset: null,

  setConnected: (project) =>
    set((s) => {
      const projectChanged = s.project?.id !== project?.id;
      return {
        connected: !!project,
        project,
        ...(projectChanged ? { samples: [], totalCount: 0, activeIndex: 0 } : {}),
      };
    }),
  applyPreset: (preset) =>
    set((s) => {
      const task = preset.task !== undefined ? preset.task : s.task;
      saveTask(task);
      return {
        preset,
        category: preset.category ?? s.category,
        labelFilter: preset.labels ?? s.labelFilter,
        task,
        mode: preset.mode ?? s.mode,
        autoAdvance: preset.autoAdvance ?? s.autoAdvance,
        autoAnnotate: preset.autoAnnotate ?? s.autoAnnotate,
        autoAccept: preset.autoAccept ?? s.autoAccept,
        embed: preset.embed ?? s.embed,
        limit: preset.limit ?? s.limit,
        debugSession: preset.debugSession ?? s.debugSession,
      };
    }),
  setSamples: (samples, totalCount) => set({ samples, totalCount, activeIndex: 0 }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setCategory: (category) => set({ category }),
  setTask: (task) => {
    saveTask(task);
    set({ task });
  },
  setLabelFilter: (labelFilter) => set({ labelFilter }),
  setAutoAdvance: (autoAdvance) => set({ autoAdvance }),
  markLabeled: (sampleId, label, boundingBoxes) =>
    set((s) => ({
      samples: s.samples.map((x) =>
        x.id === sampleId ? { ...x, label, ...(boundingBoxes ? { boundingBoxes } : {}) } : x
      ),
    })),
  reset: () =>
    set({ connected: false, project: null, samples: [], totalCount: 0, activeIndex: 0 }),
}));
