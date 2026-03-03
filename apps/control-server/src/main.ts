import { DEFAULT_CONFIG } from "./config/runtimeConfig";

function bootstrap(): void {
  // TODO: wire HTTP/WS server, OSC gateway, schema validator, and runtime store.
  console.log("ART control server scaffold boot", DEFAULT_CONFIG);
}

bootstrap();
