import { describe, expect, it, vi } from "vitest";
import { createTestContext } from "../src/testing/harness.js";
import { configurePersonaDashboard } from "./fixtures/persona-host-reference.js";

const input = {
  templateId: "cases",
  policyKey: "reviewer",
  groupId: "group-1",
  moduleKey: "cases",
};

describe("persona host reference", () => {
  it("uses the typed host directory and dashboard contract", async () => {
    const ensurePersonaDashboards = vi.fn(async () => [
      { templateId: "cases", dashboardId: "dashboard-1" },
    ]);
    const context = createTestContext({
      host: {
        listTenantGroups: async () => [{ id: "group-1", name: "Reviewers" }],
        listTenantUsers: async () => [
          {
            id: "user-1",
            name: "Reviewer",
            email: "reviewer@example.test",
            role: "viewer",
          },
        ],
        ensurePersonaDashboards,
      },
    });
    await expect(configurePersonaDashboard(context, input)).resolves.toEqual({
      dashboards: [{ templateId: "cases", dashboardId: "dashboard-1" }],
      userCount: 1,
    });
    expect(ensurePersonaDashboards).toHaveBeenCalledWith({
      templateIds: ["cases"],
      moduleKey: "cases",
      grants: [
        { templateId: "cases", policyKey: "reviewer", groupId: "group-1" },
      ],
    });
  });

  it("fails closed when the capability or selected group is absent", async () => {
    await expect(
      configurePersonaDashboard(createTestContext(), input),
    ).rejects.toThrow("unavailable");
    const ensurePersonaDashboards = vi.fn();
    await expect(
      configurePersonaDashboard(
        createTestContext({
          host: {
            listTenantGroups: async () => [],
            listTenantUsers: async () => [],
            ensurePersonaDashboards,
          },
        }),
        input,
      ),
    ).rejects.toThrow("inactive or unavailable");
    expect(ensurePersonaDashboards).not.toHaveBeenCalled();
  });
});
