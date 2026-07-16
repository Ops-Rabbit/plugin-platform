import type { PluginCapability } from "./capabilities.js";
import type { PluginInvocationContext } from "./contexts.js";
import type { PluginManifest } from "./manifest.js";

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  description: string;
  requiredPermission?: "read" | "use" | "write" | "manage";
  run(input: TInput, context: PluginInvocationContext): Promise<TOutput>;
}

export interface ActionDefinition<TInput = unknown, TOutput = unknown>
  extends ToolDefinition<TInput, TOutput> {
  destructive?: boolean;
}

export interface ScheduledJobDefinition {
  id: string;
  description: string;
  defaultSchedule?: string;
  run(context: PluginInvocationContext): Promise<void>;
}

export interface ReadRouteDefinition {
  id: string;
  path: `/${string}`;
  handle(context: PluginInvocationContext): Promise<unknown>;
}

export interface WidgetDefinition {
  id: string;
  title: string;
  load(context: PluginInvocationContext): Promise<unknown>;
}

export interface PluginRegistration {
  manifest: PluginManifest;
  tools?: ToolDefinition[];
  actions?: ActionDefinition[];
  scheduledJobs?: ScheduledJobDefinition[];
  routes?: ReadRouteDefinition[];
  widgets?: WidgetDefinition[];
}

export interface PluginDefinition extends PluginRegistration {
  readonly declaredCapabilities: readonly PluginCapability[];
}

export function definePlugin(
  registration: PluginRegistration,
): PluginDefinition {
  return Object.freeze({
    ...registration,
    declaredCapabilities: Object.freeze([
      ...registration.manifest.capabilities,
    ]),
  });
}
