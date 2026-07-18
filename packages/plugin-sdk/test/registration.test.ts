import { describe, expect, it } from "vitest";
import type { PluginManifest } from "../src/contracts/manifest.js";
import {
  definePlugin,
  isPluginToolResult,
  PLUGIN_TOOL_RESULT_KIND,
  toolResult,
} from "../src/contracts/registration.js";
import { validateRegistration } from "../src/validation/registration.js";

const manifest: PluginManifest = {
  id: "tools",
  name: "Tools",
  version: "1.0.0",
  description: "Tools",
  apiVersion: "1.0",
  main: "./dist/index.js",
  capabilities: {
    tools: [
      {
        id: "status",
        risk: "read",
        audience: "all",
        requiredPermission: "read",
      },
    ],
  },
};

const statusTool = {
  id: "status",
  description: "Status",
  risk: "read" as const,
  audience: "all" as const,
  requiredPermission: "read" as const,
  async run() {
    return null;
  },
};

describe("plugin registration", () => {
  it("defines a frozen declarative registration", () => {
    const plugin = definePlugin({ tools: [statusTool] });
    expect(plugin.tools?.[0]?.id).toBe("status");
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(validateRegistration(manifest, plugin)).toEqual([]);
  });

  it("builds a human-readable tool result with structured details", () => {
    const result = toolResult("Service api is healthy.", {
      service: "api",
      healthy: true,
    });

    expect(result).toEqual({
      kind: PLUGIN_TOOL_RESULT_KIND,
      text: "Service api is healthy.",
      value: { service: "api", healthy: true },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(isPluginToolResult(result)).toBe(true);
    expect(isPluginToolResult({ kind: PLUGIN_TOOL_RESULT_KIND })).toBe(false);
    expect(isPluginToolResult(null)).toBe(false);
  });

  it("rejects undeclared and missing registrations", () => {
    expect(
      validateRegistration(manifest, {
        actions: [
          {
            id: "restart",
            title: "Restart",
            risk: "write",
            requiredRole: "operator",
            async run() {
              return null;
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "undeclared-capability" }),
        expect.objectContaining({ code: "missing-registration" }),
      ]),
    );
  });

  it("rejects duplicate ids and security metadata mismatches", () => {
    const issues = validateRegistration(manifest, {
      tools: [statusTool, { ...statusTool, risk: "write" }],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate" }),
        expect.objectContaining({ code: "metadata-mismatch" }),
      ]),
    );
  });

  it("requires widget routes and matching route roles", () => {
    const routeManifest: PluginManifest = {
      ...manifest,
      capabilities: {
        routes: [{ path: "/status", requiredRole: "viewer" }],
        widgets: [{ id: "summary" }],
      },
    };
    const issues = validateRegistration(routeManifest, {
      routes: [
        {
          path: "/status",
          requiredRole: "admin",
          async handle() {
            return null;
          },
        },
      ],
      widgets: [{ id: "summary", title: "Summary", routePath: "/missing" }],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "metadata-mismatch" }),
        expect.objectContaining({ code: "missing-route" }),
      ]),
    );
  });

  it("rejects malformed entry shapes before iteration", () => {
    expect(validateRegistration(manifest, null as unknown as never)[0]).toEqual(
      expect.objectContaining({ code: "type" }),
    );
    const malformed = validateRegistration(manifest, {
      tools: {} as never,
      extra: [],
    } as never);
    expect(malformed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "type" }),
        expect.objectContaining({ code: "unknown-property" }),
      ]),
    );
  });

  it("requires ingress handlers and exact token security metadata", () => {
    const ingressManifest: PluginManifest = {
      ...manifest,
      capabilities: {
        ingressRoutes: [
          {
            path: "/events",
            methods: ["POST"],
            auth: "api_token",
            requiredScopes: ["events.write"],
            maxRequestBytes: 1024,
          },
        ],
      },
    };
    const issues = validateRegistration(ingressManifest, {
      ingressRoutes: [
        {
          path: "/events",
          methods: ["PUT"],
          auth: "api_token",
          requiredScopes: ["events.admin"],
          handle: null as never,
        },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "metadata-mismatch" }),
        expect.objectContaining({ code: "invalid-registration" }),
      ]),
    );
  });

  it("requires exact form-action placement and a valid availability function", () => {
    const actionManifest: PluginManifest = {
      ...manifest,
      capabilities: {
        actions: [
          {
            id: "start",
            risk: "write",
            requiredRole: "operator",
            formPlacement: {
              moduleKey: "inspections",
              recordType: "inspection",
              intent: "primary",
            },
          },
        ],
      },
    };
    const issues = validateRegistration(actionManifest, {
      actions: [
        {
          id: "start",
          title: "Start",
          risk: "write",
          requiredRole: "operator",
          formPlacement: {
            moduleKey: "inspections",
            recordType: "inspection",
            intent: "danger",
          },
          available: true as never,
          async run() {
            return null;
          },
        },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "metadata-mismatch" }),
        expect.objectContaining({ path: "$.actions[0].available" }),
      ]),
    );
  });

  it("validates handler and scheduler runtime requirements", () => {
    const runtimeManifest: PluginManifest = {
      ...manifest,
      capabilities: {
        tools: [{ id: "tool", risk: "read" }],
        actions: [{ id: "action", risk: "write", requiredRole: "operator" }],
        scheduledJobs: [{ id: "job" }],
        routes: [{ path: "/route", requiredRole: "viewer" }],
        widgets: [{ id: "widget" }],
      },
    };
    const issues = validateRegistration(runtimeManifest, {
      tools: [
        { id: "tool", description: "", risk: "read", run: null as never },
      ],
      actions: [
        {
          id: "action",
          title: "",
          risk: "write",
          requiredRole: "operator",
          run: null as never,
        },
      ],
      scheduledJobs: [
        {
          id: "job",
          description: "Job",
          intervalSeconds: 0,
          timeoutSeconds: -1,
          run: null as never,
        },
      ],
      routes: [
        { path: "/route", requiredRole: "viewer", handle: null as never },
      ],
      widgets: [
        {
          id: "widget",
          title: "Widget",
          routePath: "/route",
          type: "html" as never,
          placement: "unknown" as never,
        },
      ],
    });
    expect(
      issues.filter(({ code }) => code === "invalid-registration"),
    ).toHaveLength(6);
  });
});
