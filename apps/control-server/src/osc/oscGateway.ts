import { OscInboundMessage, OscOutboundMessage } from "../../../../packages/osc-contract/src/types";

export class OscGateway {
  send(message: OscOutboundMessage): void {
    // TODO: Implement real OSC transmit using the selected OSC library.
    // Keep this method pure and testable by injecting transport adapters.
    void message;
  }

  onMessage(handler: (message: OscInboundMessage) => void): void {
    // TODO: Subscribe to OSC input transport and forward normalized events.
    void handler;
  }
}
