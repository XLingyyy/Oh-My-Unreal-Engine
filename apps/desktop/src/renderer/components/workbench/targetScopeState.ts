import type { AssetContext, RepairSessionRecord } from '@omue/shared-protocol';
import { isAssetSession } from '@omue/shared-protocol';

export type ComposerMode = 'project' | 'asset' | null;

export type ComposerSource =
  | 'current-asset'
  | 'open-asset'
  | 'selected-session'
  | 'user-cleared'
  | 'user-project';

export interface ComposerState {
  mode: ComposerMode;
  targetAssetPath?: string;
  source: ComposerSource;
}

export interface AuthoritativeTargetInputs {
  currentAsset?: AssetContext;
  openAssets: AssetContext[];
  selectedSession: RepairSessionRecord | null;
  userModeChoice: ComposerMode;
  userTargetChoice?: string;
  hasProjectContext: boolean;
}

export type SendRequest = {
  scope: 'asset' | 'project';
  userIntent: string;
  targetAssetPath?: string;
};

export type SendValidationResult =
  | { valid: true }
  | { valid: false; reason: 'stale-target' | 'missing-target' | 'no-project-context' };

export function isTargetAuthoritative(
  targetPath: string,
  inputs: Pick<AuthoritativeTargetInputs, 'currentAsset' | 'openAssets' | 'selectedSession'>,
): boolean {
  if (inputs.currentAsset?.assetPath === targetPath) return true;
  if (inputs.openAssets.some(a => a.assetPath === targetPath)) return true;
  if (
    inputs.selectedSession &&
    isAssetSession(inputs.selectedSession) &&
    inputs.selectedSession.targetAssetPath === targetPath
  ) {
    return true;
  }
  return false;
}

export function isTargetLive(
  targetPath: string,
  inputs: Pick<AuthoritativeTargetInputs, 'currentAsset' | 'openAssets'>,
): boolean {
  if (inputs.currentAsset?.assetPath === targetPath) return true;
  if (inputs.openAssets.some(a => a.assetPath === targetPath)) return true;
  return false;
}

export function computeComposerState(inputs: AuthoritativeTargetInputs): ComposerState {
  if (inputs.userModeChoice === 'project') {
    return { mode: 'project', source: 'user-project' };
  }

  if (inputs.userTargetChoice) {
    const stillOpen = inputs.openAssets.some(a => a.assetPath === inputs.userTargetChoice);
    const isCurrent = inputs.currentAsset?.assetPath === inputs.userTargetChoice;
    if (stillOpen || isCurrent) {
      return { mode: 'asset', targetAssetPath: inputs.userTargetChoice, source: 'open-asset' };
    }
  }

  if (inputs.userModeChoice === 'asset' && inputs.currentAsset) {
    return {
      mode: 'asset',
      targetAssetPath: inputs.currentAsset.assetPath,
      source: 'current-asset',
    };
  }

  if (inputs.selectedSession) {
    if (isAssetSession(inputs.selectedSession)) {
      return {
        mode: 'asset',
        targetAssetPath: inputs.selectedSession.targetAssetPath,
        source: 'selected-session',
      };
    }
    return { mode: 'project', source: 'selected-session' };
  }

  if (inputs.currentAsset) {
    return {
      mode: 'asset',
      targetAssetPath: inputs.currentAsset.assetPath,
      source: 'current-asset',
    };
  }

  if (inputs.hasProjectContext) {
    return { mode: 'project', source: 'user-cleared' };
  }

  return { mode: null, source: 'user-cleared' };
}

export function isStaleTarget(
  composer: ComposerState,
  inputs: Pick<AuthoritativeTargetInputs, 'currentAsset' | 'openAssets'>,
): boolean {
  if (composer.mode !== 'asset' || !composer.targetAssetPath) return false;
  return !isTargetLive(composer.targetAssetPath, inputs);
}

export function validateSendRequest(
  request: SendRequest,
  inputs: AuthoritativeTargetInputs,
): SendValidationResult {
  if (request.scope === 'project') {
    if (!inputs.hasProjectContext) {
      return { valid: false, reason: 'no-project-context' };
    }
    return { valid: true };
  }

  if (!request.targetAssetPath) {
    return { valid: false, reason: 'missing-target' };
  }

  if (!isTargetLive(request.targetAssetPath, inputs)) {
    return { valid: false, reason: 'stale-target' };
  }

  return { valid: true };
}
