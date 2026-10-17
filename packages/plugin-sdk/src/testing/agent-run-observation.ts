import type {
  PluginAgentRunFrontendServiceV1,
  PluginAgentRunObservationEventV1,
  PluginAgentRunObserverV1,
} from "../contracts/agent-runs.js";
import type { OpsRabbitWorkspaceError } from "../contracts/frontend.js";
import { parsePluginAgentRunObservationEventV1 } from "../validation/agent-runs.js";

interface Observation {
  readonly observer: PluginAgentRunObserverV1;
  readonly close: () => void;
}

/**
 * Deterministic frontend fixture with the host's observation lifecycle: a
 * `closed` event or an error ends that observation, and a closed observation
 * receives nothing further. Authorization remains a host integration concern.
 */
export function createTestAgentRunObservationService(signal?: AbortSignal) {
  const listeners = new Map<string, Set<Observation>>();
  const service: PluginAgentRunFrontendServiceV1 = {
    observe({ runId }, observer) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        const set = listeners.get(runId);
        set?.delete(observation);
        if (set && !set.size) listeners.delete(runId);
        signal?.removeEventListener("abort", close);
      };
      const observation: Observation = { observer, close };
      if (signal?.aborted) closed = true;
      else {
        const set = listeners.get(runId) ?? new Set<Observation>();
        set.add(observation);
        listeners.set(runId, set);
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
    for (const observation of [...(listeners.get(runId) ?? [])]) {
      // A callback earlier in this dispatch may have closed this observation.
      if (!listeners.get(runId)?.has(observation)) continue;
      try {
        notify(observation.observer);
      } catch {
        observation.close();
        continue;
      }
      if (ends) observation.close();
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
