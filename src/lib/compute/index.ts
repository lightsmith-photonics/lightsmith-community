import { env } from "@/lib/env";
import { HttpComputeApi } from "./http";
import { MockComputeApi } from "./mock";
import type { ComputeApi } from "./types";

let instance: ComputeApi | null = null;

/** Lightsmith Cloud (lightsmith-cloud) when COMPUTE_API_URL is set, otherwise the mock runner. */
export function computeApi(): ComputeApi {
  instance ??= env.computeApiUrl ? new HttpComputeApi(env.computeApiUrl) : new MockComputeApi();
  return instance;
}

export * from "./types";
