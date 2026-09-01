# Plugin Contract 0.18: Governed Structured Classification

OpsRabbit 0.18 adds an optional tenant-scoped structured-classification broker
for explicitly declared plugin actions and scheduled jobs without exposing model
providers, credentials, host prompts, private types, or persistence internals.

## Declaration and use

```json
"structuredClassification": {
  "schemaVersion": "1",
  "actionIds": ["classify-item"],
  "scheduledJobIds": ["classify-pending"]
}
```

The host exposes `context.structuredClassification.classify(...)` only to those
invocations. Requests contain bounded content, instructions, two to 32 classes,
zero to 64 evidence items, and a timeout. Each class has a stable key, label,
description, and qualification requirements. Runtime validation rejects unknown
fields, duplicate or malformed keys, oversized text, and invalid limits.

Completed results contain a supplied class key, confidence in `[0,1]`, reason,
references limited to supplied evidence ids, and missing evidence. `timeout` and
`unavailable` are explicit protocol outcomes. Plugins must preserve deterministic
or human-review fallback behavior.

Cancellation and deadline expiry are intentionally distinct. Expiry of the
requested or shorter host-enforced classification deadline resolves
`{ "status": "timeout" }`. Cancellation of the enclosing action or scheduled-job
invocation rejects `classify(...)` with the exact `context.signal.reason`; the
host must not convert invocation cancellation into `timeout` or `unavailable`.
Plugins may perform ordinary timeout fallback, but must allow invocation
cancellation to propagate so the host can stop the larger operation.

## Host authority and lifecycle

The manifest requests access; it does not grant it. The host owns tenant and
actor authorization, plugin enablement, provider selection, credentials, policy,
quotas, cancellation, shorter deadlines, output validation, redacted telemetry,
and audit. The broker does not persist content or results by contract. Plugin
persistence remains subject to its declared storage, authorization, retention,
deletion, and legal-hold behavior.

Output is a recommendation. Plugins retain deterministic qualification and
approval gates before publication or high-impact action. The host returns
`unavailable` instead of provider-specific errors and fails invalid output closed.

## Executable reference

```bash
npm create @opsrabbit/plugin@latest governed-classifier -- --starter structured-classification
```

The starter exercises an operator action and scheduled job, explicit
unavailability, configurable request classes, and the public test broker.
