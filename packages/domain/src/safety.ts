import { ObjectState } from "./types";

export interface ObjectLimits {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  size: [number, number];
  gain: [number, number];
}

export const DEFAULT_LIMITS: ObjectLimits = {
  x: [-100, 100],
  y: [-100, 100],
  z: [-100, 100],
  size: [0, 100],
  gain: [-120, 12]
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function clampObjectState(state: ObjectState, limits: ObjectLimits = DEFAULT_LIMITS): ObjectState {
  return {
    ...state,
    x: clamp(state.x, limits.x[0], limits.x[1]),
    y: clamp(state.y, limits.y[0], limits.y[1]),
    z: clamp(state.z, limits.z[0], limits.z[1]),
    size: clamp(state.size, limits.size[0], limits.size[1]),
    gain: clamp(state.gain, limits.gain[0], limits.gain[1])
  };
}
