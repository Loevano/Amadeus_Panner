import { Action, Scene } from "../../../../packages/domain/src/types";

export interface RuntimeState {
  activeSceneId: string | null;
  runningActions: Record<string, { startedAtMs: number }>;
  scenesById: Record<string, Scene>;
  actionsById: Record<string, Action>;
}

export const EMPTY_RUNTIME_STATE: RuntimeState = {
  activeSceneId: null,
  runningActions: {},
  scenesById: {},
  actionsById: {}
};
