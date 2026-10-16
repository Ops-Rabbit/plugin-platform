import { describe, expectTypeOf, it } from "vitest";
import type {
  PluginResourceConfigurationTransactionV1,
  PluginResourceRecordsService,
  PluginResourceTransactionV1,
} from "../src/index.js";

describe("purpose-specific resource transactions", () => {
  it("exposes only configuration methods to configuration callbacks", () => {
    expectTypeOf<PluginResourceConfigurationTransactionV1>().not.toHaveProperty(
      "register",
    );
    expectTypeOf<PluginResourceConfigurationTransactionV1>().not.toHaveProperty(
      "linkInvestigation",
    );
    expectTypeOf<PluginResourceConfigurationTransactionV1>().toHaveProperty(
      "bindSourceInbound",
    );
  });
  it("exposes only record methods to record callbacks", () => {
    expectTypeOf<PluginResourceTransactionV1>().not.toHaveProperty(
      "bindSourceInbound",
    );
    expectTypeOf<PluginResourceTransactionV1>().toHaveProperty("register");
    expectTypeOf<PluginResourceTransactionV1>().toHaveProperty(
      "linkInvestigation",
    );
  });
  it("infers each callback from its declared purpose", () => {
    const verify = (service: PluginResourceRecordsService) => {
      void service.transaction(
        { kind: "incident", purpose: "configuration" },
        async (tx) => {
          expectTypeOf(
            tx,
          ).toEqualTypeOf<PluginResourceConfigurationTransactionV1>();
        },
      );
      void service.transaction(
        {
          kind: "incident",
          purpose: "records",
          operation: "create",
          ids: ["record"],
        },
        async (tx) => {
          expectTypeOf(tx).toEqualTypeOf<PluginResourceTransactionV1>();
        },
      );
    };
    expectTypeOf(verify).toBeFunction();
  });
});
