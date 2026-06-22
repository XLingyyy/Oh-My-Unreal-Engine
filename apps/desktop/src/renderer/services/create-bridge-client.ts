// BridgeClient factory — switches between Mock and Real based on env.
//
// Default: MockBridgeClient (safe when UE is not running).
// Set VITE_OMUE_BRIDGE_MODE=real to connect to a live UE bridge.
// Optionally set VITE_OMUE_BRIDGE_BASE_URL to override the default URL.

import { MockBridgeClient } from './mock-bridge-client';
import { RealHttpBridgeClient } from './http-bridge-client';
import type { BridgeClient } from './bridge-client';

export function createBridgeClient(): BridgeClient {
  const mode = import.meta.env.VITE_OMUE_BRIDGE_MODE;

  if (mode === 'real') {
    const baseUrl = import.meta.env.VITE_OMUE_BRIDGE_BASE_URL || undefined;
    return new RealHttpBridgeClient(baseUrl ? { baseUrl } : undefined);
  }

  return new MockBridgeClient();
}
