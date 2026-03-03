export interface RuntimeConfig {
  mode: "live" | "program" | "dev";
  oscOutHost: string;
  oscOutPort: number;
  oscInPort: number;
  webSocketPort: number;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  mode: "program",
  oscOutHost: "127.0.0.1",
  oscOutPort: 9000,
  oscInPort: 9001,
  webSocketPort: 8080
};
