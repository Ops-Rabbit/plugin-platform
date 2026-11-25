import type { JsonValue } from "./manifest.js";
import type { PluginAgentRunFrontendServiceV1 } from "./agent-runs.js";
import type { PluginTenantProvisioningServiceV1 } from "./tenant-provisioning.js";

export const PLUGIN_FRONTEND_SDK_VERSION = "1" as const;
export const PLUGIN_FRONTEND_CAPABILITIES = [
  "forms.catalog.read",
  "forms.submissions.read",
  "forms.submissions.write",
  "forms.attachments",
  "forms.workflow",
  "forms.actions",
  "plugin.actions.invoke",
  "agent.runs.observe",
  "plugin.resources.manage",
  "plugin.investigations.open",
  "tenant.provisioning.manage",
  "actor.email.read",
  "session.end",
] as const;

export type PluginFrontendCapability =
  (typeof PLUGIN_FRONTEND_CAPABILITIES)[number];

/** Frontend capability that adds the signed-in user's own email to `actor.email`. */
export const WORKSPACE_ACTOR_EMAIL_CAPABILITY = "actor.email.read" as const;
/** Frontend capability that adds `session.signOut()` to the workspace context. */
export const WORKSPACE_SESSION_END_CAPABILITY = "session.end" as const;
/** First OpsRabbit plugin host version that supplies `actor.email` and `session`. */
export const WORKSPACE_SESSION_IDENTITY_MINIMUM_OPSRABBIT_VERSION =
  "0.13.0" as const;

/**
 * Host-owned sign-out for the current OpsRabbit session. Present only when the workspace
 * requests `session.end` on a supporting host.
 */
export interface OpsRabbitWorkspaceSessionV1 {
  /**
   * Ends the signed-in user's current OpsRabbit session and opens the OpsRabbit login page.
   * The host revokes the session on the server and clears its own client state; the plugin
   * never calls authentication endpoints, reads cookies or clears storage itself.
   *
   * Call it from a user gesture, after the plugin's own confirmation. The host rejects the
   * call when the workspace is unloaded, when there is no recent user activation, or when the
   * capability was not declared. On success the page navigates away; a promise that resolves
   * means the host is already signing out, so keep the control disabled.
   */
  signOut(): Promise<void>;
}

export interface PluginNativeWorkspace {
  kind: "native_workspace";
  entry: `./dist/${string}.js`;
  styles: Array<`./dist/${string}.css`>;
  assets: Array<`./dist/assets/${string}/**` | "./dist/assets/**">;
  sdkVersion: typeof PLUGIN_FRONTEND_SDK_VERSION;
  mountIsolation: "shadow_dom";
  capabilities: PluginFrontendCapability[];
  actionIds?: string[];
  /** Agent run bindings this workspace may observe; requires agent.runs.observe. */
  agentRunBindingIds?: string[];
}

export interface OpsRabbitWorkspaceError extends Error {
  status?: number;
  code?: string;
  missingPermission?: string;
  details?: JsonValue;
}

export interface OpsRabbitWorkspaceContext {
  sdkVersion: typeof PLUGIN_FRONTEND_SDK_VERSION;
  plugin: { id: string; moduleKey: string; generation: string };
  tenant: { id: string };
  actor: {
    id: string;
    displayName: string;
    /**
     * The signed-in user's own email. Present only when the workspace requests
     * `actor.email.read` on a supporting host. Display it; never persist, log or send it.
     */
    email?: string;
    role: "viewer" | "operator" | "admin";
    access: Readonly<Record<string, boolean>>;
  };
  locale: WorkspaceObservable<string>;
  theme: WorkspaceObservable<"light" | "dark">;
  navigation: { go(path: string): Promise<void> };
  notifications: {
    show(input: {
      type: "success" | "error" | "info" | "warning";
      message: string;
    }): void;
  };
  confirmation: { confirm(message: string): Promise<boolean> };
  lifecycle: {
    signal: AbortSignal;
    onCleanup(callback: () => void): void;
  };
  overlayRoot: HTMLElement;
  /** Present only when the workspace declares agent.runs.observe. */
  agentRuns?: PluginAgentRunFrontendServiceV1;
  /**
   * Present only when the manifest declares tenantProvisioning and the workspace requests
   * tenant.provisioning.manage on a supporting host. Treat absence as "not available".
   */
  tenantProvisioning?: PluginTenantProvisioningServiceV1;
  /**
   * Present only when the workspace requests session.end on a supporting host. Treat absence
   * as "sign-out is not available here".
   */
  session?: OpsRabbitWorkspaceSessionV1;
  /** Resolve a declared asset to an authenticated, lifecycle-bound object URL. */
  assets: { url(path: string): Promise<string> };
  /** Invoke a manifest-declared action owned by the currently mounted plugin. */
  pluginActions?: {
    invoke(
      actionId: string,
      input?: Record<string, JsonValue>,
    ): Promise<unknown>;
  };
  /** Host revalidates tenant/record manage access and opens the standard grant UI. */
  resourceAccess?: {
    manage(input: {
      tenantId: string;
      kind: string;
      id: string;
    }): Promise<void>;
  };
  /** Host verifies record association and independent thread read before navigation. */
  investigations?: {
    open(input: {
      tenantId: string;
      kind: string;
      id: string;
      threadId: string;
    }): Promise<void>;
  };
  forms: {
    catalog(): Promise<unknown>;
    definition(id: string): Promise<unknown>;
    list(definitionId: string, options?: JsonValue): Promise<unknown>;
    get(submissionId: string): Promise<unknown>;
    create(payload: Record<string, JsonValue>): Promise<unknown>;
    update(
      submissionId: string,
      payload: Record<string, JsonValue>,
    ): Promise<unknown>;
    workflow: {
      get(): Promise<unknown>;
      record(submissionId: string): Promise<unknown>;
      transition(submissionId: string, nextStageKey: string): Promise<unknown>;
    };
    actions: {
      list(submissionId: string): Promise<unknown>;
      execute(
        submissionId: string,
        actionKey: string,
        values?: Record<string, JsonValue>,
      ): Promise<unknown>;
    };
    attachments: {
      contentUrl(submissionId: string, attachmentId: string): Promise<string>;
      text(submissionId: string, attachmentId: string): Promise<unknown>;
    };
  };
}

export interface WorkspaceObservable<T> {
  current: T;
  subscribe(listener: (value: T) => void): () => void;
}

export interface OpsRabbitWorkspaceModule {
  mount(
    target: HTMLElement,
    context: OpsRabbitWorkspaceContext,
  ): void | { destroy(): void };
}
