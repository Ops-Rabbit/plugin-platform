import type {
  PluginPermission,
  PluginRole,
  PluginRisk,
  PluginToolAudience,
  PluginWidgetPlacement,
  PluginWidgetType,
} from "./capabilities.js";
import type {
  DeploymentAdminActionContext,
  PluginIngressContext,
  PluginInvocationContext,
  PluginRouteContext,
} from "./contexts.js";
import type { JsonValue } from "./manifest.js";
import type { KnowledgeEmailProcessorDefinitionV1 } from "./knowledge-email-processor.js";
import type {
  ChatComposerStatusDefinitionV1,
  ChatTurnAdmissionDefinitionV1,
  SubjectLifecycleDefinitionV1,
} from "./interaction-policy.js";

export const PLUGIN_TOOL_RESULT_KIND = "opsrabbit.tool-result/v1" as const;

/** Host-validated client presentation requested by plugin code, never model text. */
export interface PluginToolPresentation {
  readonly clientAction?: Readonly<{
    target: string;
    labelKey: string;
    resourceRef?: string;
  }>;
  readonly suggestedFollowUpIds?: readonly string[];
}

export interface PluginToolResult<TValue extends JsonValue = JsonValue> {
  readonly kind: typeof PLUGIN_TOOL_RESULT_KIND;
  readonly text: string;
  readonly value: TValue;
  readonly presentation?: PluginToolPresentation;
}

export type PluginToolOutput = JsonValue | PluginToolResult;

export function toolResult<TValue extends JsonValue>(
  text: string,
  value: TValue,
  presentation?: PluginToolPresentation,
): PluginToolResult<TValue> {
  return Object.freeze({
    kind: PLUGIN_TOOL_RESULT_KIND,
    text,
    value,
    ...(presentation
      ? {
          presentation: Object.freeze({
            ...(presentation.clientAction
              ? {
                  clientAction: Object.freeze({ ...presentation.clientAction }),
                }
              : {}),
            ...(presentation.suggestedFollowUpIds
              ? {
                  suggestedFollowUpIds: Object.freeze([
                    ...presentation.suggestedFollowUpIds,
                  ]),
                }
              : {}),
          }),
        }
      : {}),
  });
}

export function isPluginToolResult(value: unknown): value is PluginToolResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === PLUGIN_TOOL_RESULT_KIND &&
    typeof candidate.text === "string" &&
    Object.hasOwn(candidate, "value") &&
    (candidate.presentation === undefined ||
      isPluginToolPresentation(candidate.presentation))
  );
}

function isPluginToolPresentation(
  value: unknown,
): value is PluginToolPresentation {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  const action = candidate.clientAction;
  if (
    action !== undefined &&
    (typeof action !== "object" ||
      action === null ||
      Array.isArray(action) ||
      typeof (action as Record<string, unknown>).target !== "string" ||
      typeof (action as Record<string, unknown>).labelKey !== "string" ||
      ((action as Record<string, unknown>).resourceRef !== undefined &&
        typeof (action as Record<string, unknown>).resourceRef !== "string"))
  )
    return false;
  return (
    candidate.suggestedFollowUpIds === undefined ||
    (Array.isArray(candidate.suggestedFollowUpIds) &&
      candidate.suggestedFollowUpIds.every((id) => typeof id === "string"))
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

export interface ActionDefinition<
  TInput = unknown,
  TOutput = JsonValue,
  TContext = PluginInvocationContext,
> {
  id: string;
  title: string;
  description?: string;
  risk: PluginRisk;
  requiredRole: PluginRole;
  deploymentAdminOnly?: boolean;
  formPlacement?: {
    moduleKey: string;
    recordType: string;
    intent: "primary" | "neutral" | "danger";
  };
  dataInsightAuthorization?: {
    namespace: string;
    inputField: string;
  };
  sampleInput?: Readonly<Record<string, JsonValue>>;
  available?(
    input: TInput,
    context: PluginInvocationContext,
  ): Promise<{ enabled: boolean; reason?: string }>;
  run(input: TInput, context: TContext): Promise<TOutput>;
}

export type DeploymentAdminActionDefinition<
  TInput = unknown,
  TOutput = JsonValue,
> = ActionDefinition<TInput, TOutput, DeploymentAdminActionContext> & {
  readonly deploymentAdminOnly: true;
};

/** Author a deployment-admin action with its required transaction-bound context. */
export function defineDeploymentAdminAction<
  TInput = unknown,
  TOutput = JsonValue,
>(
  definition: DeploymentAdminActionDefinition<TInput, TOutput>,
): ActionDefinition<TInput, TOutput> {
  return definition as unknown as ActionDefinition<TInput, TOutput>;
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

export interface IngressRouteDefinition<TInput = JsonValue> {
  path: `/${string}`;
  methods: Array<"POST" | "PUT" | "PATCH" | "DELETE">;
  auth: "api_token";
  requiredScopes: string[];
  handle(input: TInput, context: PluginIngressContext): Promise<JsonValue>;
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
  ingressRoutes?: IngressRouteDefinition[];
  widgets?: WidgetDefinition[];
  knowledgeEmailProcessor?: KnowledgeEmailProcessorDefinitionV1;
  chatTurnAdmission?: ChatTurnAdmissionDefinitionV1;
  chatComposerStatus?: ChatComposerStatusDefinitionV1;
  subjectLifecycle?: SubjectLifecycleDefinitionV1;
}

export function definePlugin(
  definition: PluginDefinition,
): Readonly<PluginDefinition> {
  return Object.freeze({ ...definition });
}
