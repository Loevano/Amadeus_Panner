export interface OscOutboundMessage {
  address: string;
  args: Array<number | string | boolean>;
  sequenceId: string;
  timestampMs: number;
}

export interface OscInboundMessage {
  address: string;
  args: Array<number | string | boolean>;
  sourceIp: string;
  receivedAtMs: number;
}
