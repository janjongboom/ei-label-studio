// Shared types across client and server.

export type EICategory = "training" | "testing" | "anomaly";

export type Modality = "image" | "audio" | "timeseries" | "video" | "unknown";

/** Labeling template chosen for the workspace. */
export type LabelTask = "classify" | "detect" | "audio" | "timeseries" | "sam" | "transcribe";

/** Per-class sample counts from `/raw-data/project-metadata`. */
export interface EIClassCount {
  label: string;
  dataCount: number;
}

export interface EIClassMetadata {
  labels?: EIClassCount[];
}

export interface EIProjectMetadata {
  type?: string;
  all?: EIClassMetadata;
  training?: EIClassMetadata;
  testing?: EIClassMetadata;
  anomaly?: EIClassMetadata;
}

export type WorkMode = "relabel" | "import";

export interface EIProject {
  id: number;
  name: string;
  /** "training" data acquisition project, etc. — informational. */
  category?: string;
  description?: string;
  created?: string;
  ownerName?: string;
  logo?: string | null;
  labelingMethod?: string;
}

export interface EISensor {
  name: string;
  units?: string;
}

export interface EIBoundingBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Subset of the EI `Sample` schema we actually use. */
export interface EISample {
  id: number;
  filename: string;
  label: string;
  category: EICategory;
  chartType?: "chart" | "image" | "video" | "table";
  sensors?: EISensor[];
  frequency?: number;
  intervalMs?: number;
  totalLengthMs?: number;
  valuesCount?: number;
  deviceType?: string;
  boundingBoxes?: EIBoundingBox[];
  boundingBoxesType?: string;
  imageDimensions?: { width: number; height: number };
  created?: string;
  isDisabled?: boolean;
  isProcessing?: boolean;
}

/** Connection details sealed into the encrypted per-tab session token. */
export interface EISession {
  apiKey: string;
  projectId: number;
  studioHost?: string;
  ingestionHost?: string;
}

/** Label Studio task shape (the subset we produce). */
export interface LSTask {
  id: number;
  data: Record<string, string>;
  predictions?: LSPrediction[];
  annotations?: unknown[];
}

export interface LSPrediction {
  model_version: string;
  result: LSResult[];
}

export interface LSResult {
  from_name: string;
  to_name: string;
  type: string;
  value: Record<string, unknown>;
  /** Rectangle results carry the reference image size for %→px conversion. */
  original_width?: number;
  original_height?: number;
  image_rotation?: number;
}
