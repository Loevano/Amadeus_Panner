export const OSC_ADDRESSES = {
  object: {
    x: "/art/object/{id}/x",
    y: "/art/object/{id}/y",
    z: "/art/object/{id}/z",
    size: "/art/object/{id}/size",
    gain: "/art/object/{id}/gain",
    mute: "/art/object/{id}/mute",
    algorithm: "/art/object/{id}/algorithm"
  },
  scene: {
    recall: "/art/scene/{id}/recall"
  },
  action: {
    start: "/art/action/{id}/start",
    stop: "/art/action/{id}/stop",
    abort: "/art/action/{id}/abort"
  }
} as const;

export function withObjectId(template: string, id: string): string {
  return template.replace("{id}", id);
}
