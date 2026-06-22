import type {
  CompileStatus,
  CurrentAssetData,
  OmueContextSnapshot,
  ProjectContext,
  RecentLogsData,
  BlueprintSummaryData,
  BlueprintGraphsData,
} from '@omue/shared-protocol';

export const COMPILE_STATUS_UNKNOWN: CompileStatus = {
  isCompiling: false,
  lastCompileResult: 'unknown',
  errorCount: 0,
  warningCount: 0,
  lastErrors: [],
};

export interface BuildContextSnapshotParts {
  project: ProjectContext;
  currentAssetData?: CurrentAssetData;
  logsData?: RecentLogsData;
  compileStatusData?: CompileStatus;
  blueprintSummaryData?: BlueprintSummaryData;
  blueprintGraphsData?: BlueprintGraphsData;
  bridgeVersion: string;
  now: string;
}

export function generateSnapshotId(fallbackSeed: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // fall through
    }
  }
  return `live-project-${fallbackSeed}-${Date.now()}`;
}

export function buildContextSnapshot(parts: BuildContextSnapshotParts): OmueContextSnapshot {
  return {
    snapshotId: generateSnapshotId(parts.now),
    capturedAt: parts.now,
    bridgeVersion: parts.bridgeVersion,
    project: parts.project,
    currentAsset: parts.currentAssetData?.selectedAsset ?? undefined,
    openAssets: parts.currentAssetData?.openAssets ?? [],
    recentLogs: parts.logsData?.entries ?? [],
    compileStatus: parts.compileStatusData ?? COMPILE_STATUS_UNKNOWN,
    blueprintSummary: parts.blueprintSummaryData?.selectedBlueprint ?? undefined,
    blueprintGraphs: parts.blueprintGraphsData?.selectedBlueprint ?? undefined,
    runtimeStatus: {
      isPieRunning: parts.project.editorStatus === 'playing',
      isSimulating: parts.project.editorStatus === 'simulating',
    },
  };
}
