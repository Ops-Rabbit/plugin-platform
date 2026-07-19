import type { PluginDeclaredCapabilities } from "./capabilities.js";
import type { PluginFormStarterPackReference } from "./forms.js";

export const PLUGIN_API_VERSION = "1.0" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PluginSetting = {
  key: string;
  label: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "select"
    | "string_list"
    | "secret"
    | "json";
  description?: string;
  required?: boolean;
  default?: JsonValue;
  options?: string[];
  minimum?: number;
  maximum?: number;
};

export const PLUGIN_NAVIGATION_ICONS = [
  "headset",
  "building",
  "shield_check",
] as const;
export type PluginNavigationIcon = (typeof PLUGIN_NAVIGATION_ICONS)[number];

export type PluginFormsWorkspaceNavigation = {
  kind: "forms_workspace";
  moduleKey: string;
  path: `/apps/${string}`;
  icon: PluginNavigationIcon;
  fallbackTitle: string;
  titleSetting?: string;
  iconSetting?: string;
  order?: number;
  workflow?: PluginFormsWorkflowNavigation;
};

export interface PluginFormsWorkflowNavigation {
  rootStarterKey: string;
  stageModelSetting: string;
  recordNumber?: {
    prefixSetting: string;
    digitsSetting: string;
  };
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  apiVersion: typeof PLUGIN_API_VERSION;
  main: string;
  minimumOpsRabbitVersion?: string;
  publisher?: { name: string; url?: string };
  requiredEntitlements?: string[];
  database?: {
    migrationsPath: `./migrations/${string}`;
  };
  dataInsight?: {
    catalogRoute: `/${string}`;
    templatesRoute?: `/${string}`;
    workspace?: {
      enabledSetting?: string;
      placement: "tab";
      defaultTemplateId: string;
      defaultTab?: "records" | "insights";
      allowUserDefault?: boolean;
    };
  };
  settings?: PluginSetting[];
  navigation?: PluginFormsWorkspaceNavigation;
  formStarterPack?: PluginFormStarterPackReference;
  capabilities: PluginDeclaredCapabilities;
}
