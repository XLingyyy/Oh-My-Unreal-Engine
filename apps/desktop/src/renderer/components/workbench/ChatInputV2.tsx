import { useState } from 'react';
import { useDesktopCopy } from '../../i18n';
import type { ComposerState, SendRequest, SendValidationResult } from './targetScopeState';

interface ChatInputV2Props {
  composerState: ComposerState;
  validateSend?: (request: SendRequest) => SendValidationResult;
  onSubmit?: (request: SendRequest) => void;
  onModeChange?: (mode: 'project' | 'asset') => void;
  isSubmitting?: boolean;
  providerReady: boolean;
  diagnosisModel?: string;
  onOpenSettings?: () => void;
}

export function ChatInputV2({
  composerState,
  validateSend,
  onSubmit,
  onModeChange,
  isSubmitting = false,
  providerReady,
  diagnosisModel,
  onOpenSettings,
}: ChatInputV2Props) {
  const { copy } = useDesktopCopy();
  const inputCopy = copy.ueAgentUi.chatInput;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mode = composerState.mode;
  const targetAssetPath = composerState.targetAssetPath;
  const canSubmit = mode !== null && text.trim().length > 0 && !isSubmitting;

  const handleSubmit = () => {
    if (mode === null) {
      setError(inputCopy.scopeError);
      return;
    }
    const userIntent = text.trim();
    if (userIntent.length === 0) {
      setError(inputCopy.emptyError);
      return;
    }
    if (userIntent.length > 2000) {
      setError(inputCopy.tooLongError);
      return;
    }

    const request: SendRequest =
      mode === 'asset' && targetAssetPath
        ? { scope: 'asset', userIntent, targetAssetPath }
        : { scope: 'project', userIntent };

    if (validateSend) {
      const validation = validateSend(request);
      if (!validation.valid) {
        if (validation.reason === 'stale-target') {
          setError(inputCopy.staleTargetError);
        } else if (validation.reason === 'no-project-context') {
          setError(inputCopy.noProjectContextError);
        } else if (validation.reason === 'missing-target') {
          setError(inputCopy.scopeError);
        }
        return;
      }
    }

    setError(null);
    onSubmit?.(request);
    setText('');
  };

  const scopeDisplay = mode === 'asset'
    ? `${inputCopy.scopeLabel}: ${inputCopy.modeAsset}${targetAssetPath ? ' · ' + inputCopy.targetLabel + ': ' + targetAssetPath : ''}`
    : mode === 'project'
      ? `${inputCopy.scopeLabel}: ${inputCopy.modeProject}`
      : inputCopy.hint;

  return (
    <div className="ue-chat-input" aria-label={inputCopy.placeholder}>
      {mode !== null && onModeChange && (
        <div className="ue-chat-input-toolbar">
          <button
            type="button"
            className="ue-chat-input-scope-toggle"
            onClick={() => onModeChange(mode === 'asset' ? 'project' : 'asset')}
            title={mode === 'asset' ? inputCopy.switchToProject : inputCopy.switchToAsset}
            aria-label={mode === 'asset' ? inputCopy.switchToProject : inputCopy.switchToAsset}
          >
            {mode === 'asset' ? inputCopy.modeProject : inputCopy.modeAsset}
          </button>
        </div>
      )}
      <textarea
        className="ue-chat-input-textarea"
        placeholder={inputCopy.placeholder}
        rows={1}
        aria-label={inputCopy.placeholder}
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSubmit) handleSubmit();
          }
        }}
      />
      <div className="ue-chat-input-bottom">
        {providerReady && diagnosisModel ? (
          <span className="ue-chat-input-model-label">{diagnosisModel}</span>
        ) : (
          <button
            type="button"
            className="ue-chat-input-model-required"
            onClick={onOpenSettings}
            aria-label={inputCopy.providerRequired}
          >
            {inputCopy.providerRequired}
          </button>
        )}
        <button
          type="button"
          className="wb-button wb-button-primary ue-chat-input-send"
          disabled={!canSubmit}
          aria-label={inputCopy.send}
          onClick={handleSubmit}
        >
          {isSubmitting ? inputCopy.sending : inputCopy.send}
        </button>
      </div>
      <div className="ue-chat-input-hint" role="status">
        {scopeDisplay}
        {error && <span className="ue-chat-input-error"> · {error}</span>}
      </div>
    </div>
  );
}
