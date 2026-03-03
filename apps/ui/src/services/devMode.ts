export interface DevModeFlags {
  enableOscTrace: boolean;
  enableStateDiff: boolean;
  enableSimulator: boolean;
}

export const DEFAULT_DEV_FLAGS: DevModeFlags = {
  enableOscTrace: true,
  enableStateDiff: true,
  enableSimulator: true
};
