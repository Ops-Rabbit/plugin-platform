import type { JsonValue } from "./manifest.js";

export const PLUGIN_FRONTEND_SDK_VERSION = "1" as const;
export const PLUGIN_FRONTEND_CAPABILITIES = [
  "forms.catalog.read",
  "forms.submissions.read",
  "forms.submissions.write",
  "forms.attachments",
  "forms.workflow",
  "forms.actions",
  "plugin.actions.invoke",
] as const;

export type PluginFrontendCapability =
  (typeof PLUGIN_FRONTEND_CAPABILITIES)[number];

export interface PluginNativeWorkspace {
  kind: "native_workspace";
  entry: `./dist/${string}.js`;
  styles: Array<`./dist/${string}.css`>;
  assets: Array<`./dist/assets/${string}/**` | "./dist/assets/**">;
  sdkVersion: typeof PLUGIN_FRONTEND_SDK_VERSION;
  mountIsolation: "shadow_dom";
  capabilities: PluginFrontendCapability[];
  actionIds?: string[];
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
  /** Resolve a declared asset to an authenticated, lifecycle-bound object URL. */
  assets: { url(path: string): Promise<string> };
  /** Invoke a manifest-declared action owned by the currently mounted plugin. */
  pluginActions?: {
    invoke(
      actionId: string,
      input?: Record<string, JsonValue>,
    ): Promise<unknown>;
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
