export type RuntimeMode = "live" | "program" | "dev";

export interface ObjectState {
  objectId: string;
  x: number;
  y: number;
  z: number;
  size: number;
  gain: number;
  mute: boolean;
  algorithm: string;
}

export interface Scene {
  sceneId: string;
  name: string;
  transitionMs: number;
  objects: ObjectState[];
}

export interface ActionKeyframe {
  timeMs: number;
  value: number | boolean | string;
  curve: "step" | "linear" | "ease-in" | "ease-out";
}

export interface ActionTrack {
  objectId: string;
  parameter: string;
  keyframes: ActionKeyframe[];
}

export interface Action {
  actionId: string;
  name: string;
  durationMs: number;
  tracks: ActionTrack[];
  oscTriggers: {
    start: string;
    stop: string;
    abort: string;
  };
}

export interface Showfile {
  showId: string;
  name: string;
  version: string;
  defaultSceneId: string;
  scenes: Scene[];
  actions: Action[];
}
