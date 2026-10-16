import type {
  PluginAgentRunFrontendServiceV1,
  PluginAgentRunObservationEventV1,
  PluginAgentRunObserverV1,
} from "../contracts/agent-runs.js";
import type { OpsRabbitWorkspaceError } from "../contracts/frontend.js";
import { parsePluginAgentRunObservationEventV1 } from "../validation/agent-runs.js";

/**
 * Deterministic frontend fixture with the host's observation lifecycle: a
 * `closed` event or an error ends that observation. Authorization remains a
 * host integration concern.
 */
export function createTestAgentRunObservationService(signal?: AbortSignal) {
  const listeners = new Map<string, Set<PluginAgentRunObserverV1>>();
  const closers = new Map<PluginAgentRunObserverV1, () => void>();
  const service: PluginAgentRunFrontendServiceV1 = {
    observe({ runId }, observer) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        const set = listeners.get(runId);
        set?.delete(observer);
        if (set && !set.size) listeners.delete(runId);
        signal?.removeEventListener("abort", close);
        closers.delete(observer);
      };
      if (signal?.aborted) closed = true;
      else {
        const set = listeners.get(runId) ?? new Set<PluginAgentRunObserverV1>();
        set.add(observer);
        listeners.set(runId, set);
        closers.set(observer, close);
        signal?.addEventListener("abort", close, { once: true });
      }
      return { close };
    },
  };
  const deliver = (
    runId: string,
    notify: (observer: PluginAgentRunObserverV1) => void,
    ends: boolean,
  ) => {
    for (const observer of [...(listeners.get(runId) ?? [])]) {
      try {
        notify(observer);
      } catch {
        closers.get(observer)?.();
        continue;
      }
      if (ends) closers.get(observer)?.();
    }
  };
  return {
    service,
    get activeCount() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
    emit(runId: string, event: PluginAgentRunObservationEventV1) {
      const parsed = parsePluginAgentRunObservationEventV1(event);
      deliver(
        runId,
        (observer) => observer.onEvent(parsed),
        parsed.type === "closed",
      );
    },
    fail(runId: string, error: OpsRabbitWorkspaceError) {
      deliver(runId, (observer) => observer.onError(error), true);
    },
  };
}
