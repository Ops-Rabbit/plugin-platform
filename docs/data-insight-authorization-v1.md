# Data Insight Authorization Context v1

Available in `@opsrabbit/plugin-sdk` 0.20.0.

Business plugins may attach an optional `authorization` declaration to a Data Insight dashboard template. `policy_key` and each namespaced reference are stable plugin-owned identifiers. They describe the plugin catalog; they do not grant host access.

After revalidating the active tenant, actor role, group membership, dashboard policy, and requested references, the host may provide `context.dataInsightAuthorization`:

```ts
{
  schemaVersion: 1,
  mode: "dashboard_chat",
  policyKey: "records_reviewer",
  dashboardId: "dashboard-123",
  subject: { type: "group", id: "group-123" },
  allowedReferences: {
    reports: ["records-overview"],
    metrics: ["record-count"]
  }
}
```

The context is absent outside an authorized invocation. Plugins must reject an operation unless its stable reference appears in the appropriate attested namespace and in the plugin's current catalog. Plugins must not infer access from display labels, settings alone, conversation bindings, or an unattested template declaration.

The host owns group/dashboard mapping, actor and tenant revalidation, resource grants, atomic authorization events, revocation, expiry, and dashboard deletion behavior. The plugin owns its policy vocabulary and catalog references. Use `validateDataInsightAuthorizationContext` for persisted or adapter-produced values; the packaged JSON Schema is exported as `@opsrabbit/plugin-sdk/data-insight-authorization-context-schema`.
