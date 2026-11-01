import { env } from "@/lib/env";
import { HttpMaterialsApi } from "./http";
import { MockMaterialsApi } from "./mock";
import type { MaterialsApi } from "./types";

let instance: MaterialsApi | null = null;

/** Lightsmith Materials (lightsmith-materials) when MATERIALS_API_URL is set, otherwise the fixture mock. */
export function materialsApi(): MaterialsApi {
  instance ??= env.materialsApiUrl ? new HttpMaterialsApi(env.materialsApiUrl) : new MockMaterialsApi();
  return instance;
}

export * from "./types";
