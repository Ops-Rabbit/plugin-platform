import { describe, expect, it, vi } from "vitest";
import {
  queryRegisteredResources,
  createRegisteredResource,
  deleteRegisteredResources,
  enrichRegisteredResource,
  cleanupRegisteredResourceTenant,
} from "../reference/resource-workspace.mjs";
const query = {
  schemaVersion: "1",
  kind: "incident",
  tenantIds: "all",
  candidates: {
    sql: "select tenant_id,id as resource_id from incidents",
    parameters: [],
  },
  orderBy: [{ column: "resource_id", direction: "asc" }],
  page: 1,
  pageSize: 25,
};
const registration = {
  kind: "incident",
  id: "incident-1",
  eligibleAt: "2026-10-16T00:00:00.000Z",
};
const enrichment = {
  schemaVersion: "1",
  resource: { kind: "incident", id: "incident-1" },
  title: "AUTH-42",
  description: "Synthetic event",
  generateTitle: true,
  fields: {},
  timeoutMs: 30000,
};
const deletion = {
  schemaVersion: "1",
  kind: "incident",
  ids: ["incident-1"],
  reason: "retention",
};
function context() {
  return {
    tenantId: "tenant-a",
    actor: { id: "owner-a", role: "admin", kind: "user" },
    signal: new globalThis.AbortController().signal,
  };
}
describe("public resource workspace executable reference", () => {
  it("delegates validated query to host service and preserves its scoped result", async () => {
    const result = { rows: [], total: 0, page: 1, pageSize: 25 };
    await expect(
      queryRegisteredResources(
        { ...context(), resourceRecords: { query: async () => result } },
        query,
      ),
    ).resolves.toBe(result);
  });
  it("calls registration and canonical write inside the host transaction", async () => {
    const order = [];
    const database = {
      execute: async () => {
        order.push("canonical-write");
      },
    };
    const resourceRecords = {
      transaction: async (input, run) => {
        expect(input).toEqual({
          kind: "incident",
          purpose: "records",
          operation: "create",
          ids: ["incident-1"],
        });
        order.push("host-policy-admission");
        const result = await run({
          database,
          register: async () => {
            order.push("register");
            return { ownerUserId: "owner-a" };
          },
        });
        order.push("commit");
        return result;
      },
    };
    await expect(
      createRegisteredResource(
        { ...context(), resourceRecords },
        registration,
        async (db, owner) => {
          expect(owner).toBe("owner-a");
          await db.execute();
          return "incident-1";
        },
      ),
    ).resolves.toBe("incident-1");
    expect(order).toEqual([
      "host-policy-admission",
      "register",
      "canonical-write",
      "commit",
    ]);
  });
  it("does not enter consumer writes when host persistence admission rejects", async () => {
    const write = vi.fn();
    await expect(
      createRegisteredResource(
        {
          ...context(),
          resourceRecords: {
            transaction: async () => {
              throw new Error("do_not_persist");
            },
          },
        },
        registration,
        write,
      ),
    ).rejects.toThrow("do_not_persist");
    expect(write).not.toHaveBeenCalled();
  });
  it("propagates write failure to the host transaction", async () => {
    const failure = new Error("canonical SQL failed");
    let committed = false;
    const service = {
      transaction: async (_input, run) => {
        await run({ register: async () => ({ ownerUserId: "owner-a" }) });
        committed = true;
      },
    };
    await expect(
      createRegisteredResource(
        { ...context(), resourceRecords: service },
        registration,
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(committed).toBe(false);
  });
  it("rejects absent authority, unsupported host and invalid requests before service effects", async () => {
    const serviceQuery = vi.fn();
    const serviceTransaction = vi.fn();
    const ctx = {
      ...context(),
      resourceRecords: { query: serviceQuery, transaction: serviceTransaction },
    };
    await expect(
      queryRegisteredResources({ ...ctx, actor: undefined }, query),
    ).rejects.toThrow("actor");
    await expect(
      queryRegisteredResources({ ...ctx, tenantId: "" }, query),
    ).rejects.toThrow("tenant");
    await expect(
      queryRegisteredResources(ctx, { ...query, page: 0 }),
    ).rejects.toThrow("Invalid resource query");
    await expect(
      createRegisteredResource(ctx, { ...registration, id: "" }, vi.fn()),
    ).rejects.toThrow("Invalid resource registration");
    await expect(queryRegisteredResources(context(), query)).rejects.toThrow(
      "unavailable",
    );
    await expect(
      createRegisteredResource(context(), registration, vi.fn()),
    ).rejects.toThrow("unavailable");
    expect(serviceQuery).not.toHaveBeenCalled();
    expect(serviceTransaction).not.toHaveBeenCalled();
  });
  it("validates lifecycle batch and preserves callback failure/cancellation", async () => {
    const deleteRecords = vi.fn(async () => {});
    const definition = { schemaVersion: "1", deleteRecords };
    await deleteRegisteredResources(definition, deletion, context());
    expect(deleteRecords).toHaveBeenCalledWith(
      deletion,
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
    await expect(
      deleteRegisteredResources(
        definition,
        { ...deletion, ids: [] },
        context(),
      ),
    ).rejects.toThrow("Invalid resource deletion");
    await expect(
      deleteRegisteredResources(definition, deletion, {
        ...context(),
        tenantId: "",
      }),
    ).rejects.toThrow("tenant");
    await expect(
      deleteRegisteredResources(undefined, deletion, context()),
    ).rejects.toThrow("unavailable");
    await expect(
      deleteRegisteredResources(
        { schemaVersion: "2", deleteRecords },
        deletion,
        context(),
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      deleteRegisteredResources({ schemaVersion: "1" }, deletion, context()),
    ).rejects.toThrow("unavailable");
    await expect(
      deleteRegisteredResources(
        {
          schemaVersion: "1",
          deleteRecords: async () => {
            throw new Error("rollback");
          },
        },
        deletion,
        context(),
      ),
    ).rejects.toThrow("rollback");
    const controller = new globalThis.AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      deleteRegisteredResources(definition, deletion, {
        ...context(),
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    await expect(
      queryRegisteredResources(
        { ...context(), signal: controller.signal },
        query,
      ),
    ).rejects.toThrow("cancelled");
    expect(deleteRecords).toHaveBeenCalledTimes(1);
  });
  it("validates enrichment output without hiding unavailable or timeout outcomes", async () => {
    for (const result of [
      { status: "completed", title: "Unusual sign-in", values: {} },
      { status: "timeout" },
      { status: "unavailable", reason: "policy_blocked" },
    ]) {
      await expect(
        enrichRegisteredResource(
          {
            ...context(),
            structuredEnrichment: { enrich: async () => result },
          },
          enrichment,
        ),
      ).resolves.toBe(result);
    }
    await expect(
      enrichRegisteredResource(context(), enrichment),
    ).rejects.toThrow("unavailable");
    const enrich = vi.fn();
    await expect(
      enrichRegisteredResource(
        { ...context(), structuredEnrichment: { enrich } },
        { ...enrichment, resource: { kind: "incident", id: "" } },
      ),
    ).rejects.toThrow("Invalid enrichment input");
    expect(enrich).not.toHaveBeenCalled();
    await expect(
      enrichRegisteredResource(
        {
          ...context(),
          structuredEnrichment: {
            enrich: async () => ({
              status: "completed",
              values: { tenant_id: "tenant-b" },
            }),
          },
        },
        enrichment,
      ),
    ).rejects.toThrow("Invalid enrichment result");
    const controller = new globalThis.AbortController();
    await expect(
      enrichRegisteredResource(
        {
          ...context(),
          signal: controller.signal,
          structuredEnrichment: {
            enrich: async () => {
              controller.abort(new Error("cancelled after provider"));
              return { status: "timeout" };
            },
          },
        },
        enrichment,
      ),
    ).rejects.toThrow("cancelled after provider");
  });
  it("cleans zero-record tenants and resumes bounded configuration batches", async () => {
    const ctx = context();
    let calls = 0;
    const definition = {
      schemaVersion: "1",
      cleanupTenant: async (current) => {
        expect(current.tenantId).toBe("tenant-a");
        calls += 1;
        return { complete: calls > 1 };
      },
    };
    expect(await cleanupRegisteredResourceTenant(definition, ctx)).toEqual({
      complete: false,
    });
    expect(await cleanupRegisteredResourceTenant(definition, ctx)).toEqual({
      complete: true,
    });
    expect(calls).toBe(2);
    await expect(
      cleanupRegisteredResourceTenant(definition, { ...ctx, tenantId: "" }),
    ).rejects.toThrow("tenant");
    await expect(
      cleanupRegisteredResourceTenant(undefined, ctx),
    ).rejects.toThrow("unavailable");
    await expect(
      cleanupRegisteredResourceTenant(
        { schemaVersion: "2", cleanupTenant: async () => ({ complete: true }) },
        ctx,
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      cleanupRegisteredResourceTenant({ schemaVersion: "1" }, ctx),
    ).rejects.toThrow("unavailable");
    await expect(
      cleanupRegisteredResourceTenant(
        {
          schemaVersion: "1",
          cleanupTenant: async () => ({ complete: "yes" }),
        },
        ctx,
      ),
    ).rejects.toThrow("Invalid tenant cleanup");
    await expect(
      cleanupRegisteredResourceTenant(
        {
          schemaVersion: "1",
          cleanupTenant: async () => {
            throw new Error("cleanup rolled back");
          },
        },
        ctx,
      ),
    ).rejects.toThrow("cleanup rolled back");
  });
  it("keeps a denied existing-record mutation outside plugin SQL", async () => {
    const write = vi.fn();
    const resourceRecords = {
      transaction: async (input) => {
        expect(input.ids).toEqual(["incident-1"]);
        throw new Error("write permission required");
      },
    };
    await expect(
      createRegisteredResource(
        { ...context(), resourceRecords },
        registration,
        write,
      ),
    ).rejects.toThrow("write permission required");
    expect(write).not.toHaveBeenCalled();
  });
});
