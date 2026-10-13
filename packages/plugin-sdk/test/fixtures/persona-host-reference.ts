import type { PluginInvocationContext } from "../../src/contracts/contexts.js";

/** Example plugin action body; the host still authorizes every helper call. */
export async function configurePersonaDashboard(
  context: PluginInvocationContext,
  input: {
    templateId: string;
    policyKey: string;
    groupId: string;
    moduleKey: string;
  },
) {
  const host = context.host;
  if (
    !host?.listTenantGroups ||
    !host.listTenantUsers ||
    !host.ensurePersonaDashboards
  ) {
    throw new Error("Persona host capability is unavailable.");
  }
  const [groups, users] = await Promise.all([
    host.listTenantGroups(),
    host.listTenantUsers(),
  ]);
  if (!groups.some((group) => group.id === input.groupId)) {
    throw new Error("The selected group is inactive or unavailable.");
  }
  const dashboards = await host.ensurePersonaDashboards({
    templateIds: [input.templateId],
    moduleKey: input.moduleKey,
    grants: [
      {
        templateId: input.templateId,
        policyKey: input.policyKey,
        groupId: input.groupId,
      },
    ],
  });
  return { dashboards, userCount: users.length };
}
