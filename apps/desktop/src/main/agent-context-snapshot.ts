import type {
  AssetContext,
  BlueprintAssetSummary,
  BlueprintGraphsData,
  BlueprintSummary,
  BlueprintSummaryData,
  CompileIssue,
  CompileStatus,
  CurrentAssetData,
  OmueContextSnapshot,
  ProjectContext,
  RecentLogsData,
} from '@omue/shared-protocol';
import { buildContextSnapshot, COMPILE_STATUS_UNKNOWN } from '../shared/context-snapshot-builder';

export interface ContextEndpointFetcher {
  getProjectContext(): Promise<ProjectContext>;
  getCurrentAsset(): Promise<CurrentAssetData>;
  getRecentLogs(): Promise<RecentLogsData>;
  getCompileStatus(): Promise<CompileStatus>;
  getBlueprintSummary(): Promise<BlueprintSummaryData>;
  getBlueprintGraphs(): Promise<BlueprintGraphsData>;
}

export interface AssetContextData {
  compileIssues: CompileIssue[];
  blueprintSummary: BlueprintAssetSummary;
  graphDetailJson?: string;
  messageLogJson?: string;
}

export interface ContextProvenance {
  endpointsCalled: string[];
  capturedAt: string;
  bridgeVersion: string;
}

export type ProjectSnapshotResult =
  | { ok: true; snapshot: OmueContextSnapshot; provenance: ContextProvenance }
  | {
      ok: false;
      errorCode: 'context_project_unavailable';
      message: string;
      provenance: ContextProvenance;
    };

export type AssetContextResult =
  | { ok: true; context: AssetContextData; provenance: ContextProvenance }
  | {
      ok: false;
      errorCode: 'target_not_open' | 'context_project_unavailable';
      message: string;
      recoverable: boolean;
    };

function nowIso(): string {
  return new Date().toISOString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findAssetByPath(
  currentAssetData: CurrentAssetData | undefined,
  targetAssetPath: string,
): AssetContext | undefined {
  if (!currentAssetData) return undefined;
  const selected = currentAssetData.selectedAsset;
  if (selected && selected.assetPath === targetAssetPath) {
    return selected;
  }
  const opened = currentAssetData.openAssets.find(
    (asset) => asset.assetPath === targetAssetPath,
  );
  return opened;
}

function mapBlueprintSummaryToAssetSummary(
  blueprintSummary: BlueprintSummary | undefined,
  targetAssetPath: string,
  fallbackAsset: AssetContext | undefined,
): BlueprintAssetSummary {
  if (blueprintSummary && blueprintSummary.objectPath === targetAssetPath) {
    return {
      assetPath: blueprintSummary.objectPath,
      displayName: blueprintSummary.name,
      assetClass: blueprintSummary.assetClass,
      eligibility: 'eligible_scratch_or_test',
      dirtyState: blueprintSummary.isDirty ? 'dirty' : 'clean',
      source: 'real_readonly_bridge',
    };
  }
  return {
    assetPath: targetAssetPath,
    displayName: fallbackAsset?.assetName ?? targetAssetPath.split('/').pop() ?? targetAssetPath,
    assetClass: fallbackAsset?.assetClass ?? 'Blueprint',
    eligibility: 'unknown',
    dirtyState: fallbackAsset?.isDirty ? 'dirty' : 'clean',
    source: 'real_readonly_bridge',
  };
}

export async function aggregateProjectSnapshot(
  fetcher: ContextEndpointFetcher,
  bridgeVersion: string,
): Promise<ProjectSnapshotResult> {
  const endpointsCalled: string[] = [];
  const capturedAt = nowIso();
  const provenance: ContextProvenance = { endpointsCalled, capturedAt, bridgeVersion };

  let projectData: ProjectContext;
  try {
    projectData = await fetcher.getProjectContext();
    endpointsCalled.push('context/project');
  } catch (error) {
    return {
      ok: false,
      errorCode: 'context_project_unavailable',
      message: getErrorMessage(error),
      provenance,
    };
  }

  let currentAssetData: CurrentAssetData | undefined;
  try {
    currentAssetData = await fetcher.getCurrentAsset();
    endpointsCalled.push('context/current-asset');
  } catch {
    // enhancement — degrade
  }

  let logsData: RecentLogsData | undefined;
  try {
    logsData = await fetcher.getRecentLogs();
    endpointsCalled.push('logs/recent');
  } catch {
    // enhancement — degrade
  }

  let compileStatusData: CompileStatus | undefined;
  try {
    compileStatusData = await fetcher.getCompileStatus();
    endpointsCalled.push('compile/status');
  } catch {
    // enhancement — degrade
  }

  let blueprintSummaryData: BlueprintSummaryData | undefined;
  try {
    blueprintSummaryData = await fetcher.getBlueprintSummary();
    endpointsCalled.push('context/blueprint-summary');
  } catch {
    // enhancement — degrade
  }

  let blueprintGraphsData: BlueprintGraphsData | undefined;
  try {
    blueprintGraphsData = await fetcher.getBlueprintGraphs();
    endpointsCalled.push('context/blueprint-graphs');
  } catch {
    // enhancement — degrade
  }

  const snapshot = buildContextSnapshot({
    project: projectData,
    currentAssetData,
    logsData,
    compileStatusData,
    blueprintSummaryData,
    blueprintGraphsData,
    bridgeVersion,
    now: capturedAt,
  });

  return { ok: true, snapshot, provenance };
}

export async function collectAssetContext(
  fetcher: ContextEndpointFetcher,
  targetAssetPath: string,
  bridgeVersion: string,
): Promise<AssetContextResult> {
  const endpointsCalled: string[] = [];
  const capturedAt = nowIso();
  const provenance: ContextProvenance = { endpointsCalled, capturedAt, bridgeVersion };

  let currentAssetData: CurrentAssetData | undefined;
  try {
    currentAssetData = await fetcher.getCurrentAsset();
    endpointsCalled.push('context/current-asset');
  } catch {
    // Cannot validate target without current-asset data
  }

  const targetAsset = findAssetByPath(currentAssetData, targetAssetPath);
  if (!targetAsset) {
    return {
      ok: false,
      errorCode: 'target_not_open',
      message:
        `Target asset "${targetAssetPath}" is not currently selected or open in the UE editor. ` +
        'Open or select the asset in UE before starting an asset session.',
      recoverable: true,
    };
  }

  let compileStatusData: CompileStatus = COMPILE_STATUS_UNKNOWN;
  try {
    compileStatusData = await fetcher.getCompileStatus();
    endpointsCalled.push('compile/status');
  } catch {
    // enhancement — degrade
  }

  const compileIssues: CompileIssue[] = compileStatusData.lastErrors ?? [];

  let blueprintSummary: BlueprintSummary | undefined;
  try {
    const summaryData = await fetcher.getBlueprintSummary();
    endpointsCalled.push('context/blueprint-summary');
    blueprintSummary = summaryData.selectedBlueprint ?? undefined;
  } catch {
    // enhancement — degrade
  }

  let graphDetailJson: string | undefined;
  try {
    const graphsData = await fetcher.getBlueprintGraphs();
    endpointsCalled.push('context/blueprint-graphs');
    if (graphsData.selectedBlueprint) {
      graphDetailJson = JSON.stringify(graphsData.selectedBlueprint);
    }
  } catch {
    // enhancement — degrade
  }

  let messageLogJson: string | undefined;
  try {
    const logsData = await fetcher.getRecentLogs();
    endpointsCalled.push('logs/recent');
    messageLogJson = JSON.stringify(logsData.entries ?? []);
  } catch {
    // enhancement — degrade
  }

  const assetSummary = mapBlueprintSummaryToAssetSummary(
    blueprintSummary,
    targetAssetPath,
    targetAsset,
  );

  return {
    ok: true,
    context: {
      compileIssues,
      blueprintSummary: assetSummary,
      ...(graphDetailJson !== undefined ? { graphDetailJson } : {}),
      ...(messageLogJson !== undefined ? { messageLogJson } : {}),
    },
    provenance,
  };
}

export { buildContextSnapshot, COMPILE_STATUS_UNKNOWN };
