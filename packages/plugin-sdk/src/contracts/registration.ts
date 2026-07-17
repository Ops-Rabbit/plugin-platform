import type {
  PluginPermission,
  PluginRole,
  PluginRisk,
  PluginToolAudience,
  PluginWidgetPlacement,
  PluginWidgetType,
} from "./capabilities.js";
import type {
  PluginInvocationContext,
  PluginRouteContext,
} from "./contexts.js";
import type { JsonValue } from "./manifest.js";

export const PLUGIN_TOOL_RESULT_KIND = "opsrabbit.tool-result/v1" as const;

export interface PluginToolResult<TValue extends JsonValue = JsonValue> {
  readonly kind: typeof PLUGIN_TOOL_RESULT_KIND;
  readonly text: string;
  readonly value: TValue;
}

export type PluginToolOutput = JsonValue | PluginToolResult;

export function toolResult<TValue extends JsonValue>(
  text: string,
  value: TValue,
): PluginToolResult<TValue> {
  return Object.freeze({ kind: PLUGIN_TOOL_RESULT_KIND, text, value });
}

export function isPluginToolResult(value: unknown): value is PluginToolResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === PLUGIN_TOOL_RESULT_KIND &&
    typeof candidate.text === "string" &&
    Object.hasOwn(candidate, "value")
  );
}

export interface ToolDefinition<
  TInput = unknown,
  TOutput extends PluginToolOutput = PluginToolOutput,
> {
  id: string;
  description: string;
  risk: PluginRisk;
  audience?: PluginToolAudience;
  requiredPermission?: PluginPermission;
  inputSchema?: Readonly<Record<string, unknown>>;
  run(input: TInput, context: PluginInvocationContext): Promise<TOutput>;
}

export interface ActionDefinition<TInput = unknown, TOutput = JsonValue> {
  id: string;
  title: string;
  description?: string;
  risk: PluginRisk;
  requiredRole: PluginRole;
  deploymentAdminOnly?: boolean;
  sampleInput?: Readonly<Record<string, JsonValue>>;
  run(input: TInput, context: PluginInvocationContext): Promise<TOutput>;
}

export interface ScheduledJobDefinition {
  id: string;
  description: string;
  intervalSeconds: number;
  timeoutSeconds?: number;
  maxRetries?: number;
  retryBackoffSeconds?: number;
  allowOverlap?: boolean;
  run(context: PluginInvocationContext): Promise<void>;
}

export interface ReadRouteDefinition {
  path: `/${string}`;
  requiredRole: PluginRole;
  handle(context: PluginRouteContext): Promise<JsonValue>;
}

export interface WidgetDefinition {
  id: string;
  title: string;
  description?: string;
  routePath: `/${string}`;
  type?: PluginWidgetType;
  placement?: PluginWidgetPlacement;
  requiredRole?: PluginRole;
  refreshSeconds?: number | null;
  defaultQuery?: Readonly<Record<string, string>>;
}

export interface PluginDefinition {
  tools?: ToolDefinition[];
  actions?: ActionDefinition[];
  scheduledJobs?: ScheduledJobDefinition[];
  routes?: ReadRouteDefinition[];
  widgets?: WidgetDefinition[];
}

export function definePlugin(
  definition: PluginDefinition,
): Readonly<PluginDefinition> {
  return Object.freeze({ ...definition });
}
