import type {
  BlueprintAssetSummary,
  BlueprintInventoryEntry,
  BlueprintInventoryHealth,
  BlueprintInventorySourceKind,
  BlueprintInventoryState,
} from '@omue/shared-protocol';
import { getMockAssets } from './blueprint-change-plan-service';

const MOCK_SOURCE: BlueprintInventorySourceKind = 'mock_local';
const MOCK_HEALTH: BlueprintInventoryHealth = 'loaded';

const MOCK_INVENTORY_STATE: BlueprintInventoryState = {
  sourceKind: MOCK_SOURCE,
  health: MOCK_HEALTH,
  items: getMockAssets().map(toInventoryEntry),
  requestTimestamp: new Date().toISOString(),
  detail: 'Mock/local fixture inventory — no real UE bridge asset listing.',
};

function toInventoryEntry(asset: BlueprintAssetSummary): BlueprintInventoryEntry {
  return {
    assetPath: asset.assetPath,
    displayName: asset.displayName,
    assetClass: asset.assetClass,
    eligibility: asset.eligibility,
    dirtyState: asset.dirtyState,
    source: asset.source,
  };
}

let manualEntries: BlueprintInventoryEntry[] = [];

const DEFERRED_BRIDGE_STATE: BlueprintInventoryState = {
  sourceKind: 'real_bridge_future',
  health: 'unavailable',
  items: [],
  requestTimestamp: new Date().toISOString(),
  detail: 'Real UE read-only Blueprint inventory is not available yet: the codebase has no established safe AssetRegistry scanning pattern. A full-project scan requires a dedicated bridge endpoint, collector, client contract, and safety review.',
};

export function getDefaultInventory(): BlueprintInventoryState {
  return { ...MOCK_INVENTORY_STATE, items: [...MOCK_INVENTORY_STATE.items] };
}

export function addManualTarget(
  assetPath: string,
  displayName: string,
  assetClass: string,
): BlueprintInventoryEntry {
  const entry: BlueprintInventoryEntry = {
    assetPath,
    displayName,
    assetClass,
    eligibility: 'production_write_blocked',
    dirtyState: 'not recorded',
    source: 'manual_entry',
  };
  const existingIndex = manualEntries.findIndex(e => e.assetPath === assetPath);
  if (existingIndex >= 0) {
    manualEntries[existingIndex] = entry;
  } else {
    manualEntries.push(entry);
  }
  return entry;
}

export function getCombinedInventory(): BlueprintInventoryState {
  const mock = MOCK_INVENTORY_STATE;
  const manual = manualEntries;
  const combined = [...mock.items];
  for (const m of manual) {
    if (!combined.some(c => c.assetPath === m.assetPath)) {
      combined.push(m);
    }
  }
  const kind: BlueprintInventorySourceKind =
    manualEntries.length > 0 ? 'manual' : mock.sourceKind;
  return {
    sourceKind: kind,
    health: 'loaded',
    items: combined,
    requestTimestamp: new Date().toISOString(),
    detail:
      manualEntries.length > 0
        ? 'Mock/local fixture inventory with manually added existing-Blueprint entries. Manual targets are planning/review only and are write-blocked.'
        : MOCK_INVENTORY_STATE.detail,
  };
}

export function getDeferredBridgeState(): BlueprintInventoryState {
  return { ...DEFERRED_BRIDGE_STATE };
}

export function clearManualTargets(): void {
  manualEntries = [];
}
