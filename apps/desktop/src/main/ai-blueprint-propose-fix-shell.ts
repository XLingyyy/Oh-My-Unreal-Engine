import { ipcMain } from 'electron';
import type { AgentProposalResult } from '@omue/shared-protocol';
import { getAiProviderConfig } from './ai-blueprint-explanation-shell';
import { requestAgentProposal } from './ai-blueprint-propose-fix-provider';
import { validateAgentProposalRequest } from './ai-blueprint-propose-fix-provider-types';
import { checkBaseUrlQuery } from './ai-blueprint-explanation-provider-types';

export function registerAiBlueprintProposeFixShell(): void {
  ipcMain.handle(
    'ai:blueprint-propose-fix:request-proposal',
    async (_event, request: unknown): Promise<AgentProposalResult> => {
      const config = getAiProviderConfig();
      if (!config) {
        return {
          ok: false,
          errorCode: 'no_provider_config',
          message: 'AI provider is not configured.',
        };
      }

      const queryErr = checkBaseUrlQuery(config.baseUrl);
      if (queryErr) {
        return {
          ok: false,
          errorCode: 'invalid_request',
          message: queryErr,
        };
      }

      const validated = validateAgentProposalRequest(request);
      if (!validated.ok) {
        return {
          ok: false,
          errorCode: 'invalid_request',
          message: validated.message,
        };
      }

      return requestAgentProposal(validated.request, config);
    },
  );
}
