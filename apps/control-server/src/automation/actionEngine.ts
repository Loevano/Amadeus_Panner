import { RuntimeState } from "../state/runtimeState";

export class ActionEngine {
  startAction(state: RuntimeState, actionId: string, nowMs: number): RuntimeState {
    return {
      ...state,
      runningActions: {
        ...state.runningActions,
        [actionId]: { startedAtMs: nowMs }
      }
    };
  }

  stopAction(state: RuntimeState, actionId: string): RuntimeState {
    const next = { ...state.runningActions };
    delete next[actionId];
    return { ...state, runningActions: next };
  }
}
