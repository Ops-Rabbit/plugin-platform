import type { PluginCapability } from "./capabilities.js";

export const PLUGIN_API_VERSION = "1.0" as const;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  apiVersion: typeof PLUGIN_API_VERSION;
  main: string;
  capabilities: PluginCapability[];
  minimumOpsRabbitVersion?: string;
  publisher?: {
    name: string;
    url?: string;
  };
}
