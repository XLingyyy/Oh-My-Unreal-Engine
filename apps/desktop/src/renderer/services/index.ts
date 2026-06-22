export type { BridgeClient, BridgeHealth, MockBridgeScenario } from './bridge-client';
export { MockBridgeClient } from './mock-bridge-client';

// Real HTTP Bridge Client (Phase D)
export { RealHttpBridgeClient } from './http-bridge-client';

// BridgeClient factory (switches between Mock / Real via env)
export { createBridgeClient } from './create-bridge-client';

// HTTP Bridge Client contract (types only, not implemented)
export {
  DEFAULT_BRIDGE_BASE_URL,
  DEFAULT_BRIDGE_TIMEOUT_MS,
  BRIDGE_ENDPOINT,
  BridgeErrorCode,
  DEFAULT_MAX_RETRIES,
  RETRYABLE_ERROR_CODES,
  isRetryableErrorCode,
  getErrorUiStrategy,
} from './http-bridge-client.contract';
export type {
  BridgeEndpointName,
  HttpBridgeClientOptions,
  BridgeErrorCodeValue,
  BridgeClientError,
  BridgeRequestDiagnostic,
  BridgeEndpointTypes,
  BridgeErrorUiStrategy,
  BridgeRequestOptions,
} from './http-bridge-client.contract';
