import { useState } from 'react';
import { useDesktopCopy } from '../../i18n';
import type { RepairSessionRecord } from '@omue/shared-protocol';
import { isAssetSession, isProjectSession } from '@omue/shared-protocol';

interface ChatHeaderProps {
  sessions: RepairSessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onResumeInterrupted: () => void;
  hasInterrupted: boolean;
  isDraftSession?: boolean;
}

function sessionDisplay(session: RepairSessionRecord, t: {
  sessionAssetLabel: string;
  sessionProjectLabel: string;
}): string {
  if (isAssetSession(session)) {
    const target = session.targetAssetPath.split('/').pop() ?? session.targetAssetPath;
    return `${t.sessionAssetLabel}: ${target}`;
  }
  return t.sessionProjectLabel;
}

function sessionScopeLabel(session: RepairSessionRecord, t: {
  sessionAssetLabel: string;
  sessionProjectLabel: string;
}): string {
  return isProjectSession(session) ? t.sessionProjectLabel : t.sessionAssetLabel;
}

export function ChatHeader({
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onResumeInterrupted,
  hasInterrupted,
  isDraftSession = false,
}: ChatHeaderProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.chatHeader;
  const [open, setOpen] = useState(false);

  const selectedSession = sessions.find(s => s.sessionId === selectedSessionId);

  const selectorLabel = isDraftSession
    ? t.draftSessionLabel
    : selectedSession
      ? sessionDisplay(selectedSession, t)
      : t.sessionListPlaceholder;

  return (
    <div className="ue-chat-header">
      <button
        type="button"
        className="ue-button ue-button-secondary ue-chat-header-new"
        aria-label={t.newSession}
        onClick={() => {
          setOpen(false);
          onNewSession();
        }}
      >
        {t.newSession} <span aria-hidden="true">+</span>
      </button>
      {sessions.length > 0 ? (
        <button
          type="button"
          className="ue-button ue-button-secondary ue-chat-header-select"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(prev => !prev)}
        >
          {selectorLabel}
        </button>
      ) : isDraftSession ? (
        <span className="ue-chat-header-draft-label" data-session-mode="draft">
          {t.draftSessionLabel}
        </span>
      ) : null}
      {open && sessions.length > 0 && (
        <ul className="ue-chat-header-list" role="listbox">
          {sessions.map(session => (
            <li key={session.sessionId}>
              <button
                type="button"
                role="option"
                aria-selected={session.sessionId === selectedSessionId}
                className="ue-chat-header-list-item"
                onClick={() => {
                  setOpen(false);
                  onSelectSession(session.sessionId);
                }}
              >
                <span className="ue-chat-header-list-scope">{sessionScopeLabel(session, t)}</span>
                <span>{sessionDisplay(session, t)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="ue-chat-header-divider" aria-hidden="true" />
      {hasInterrupted && (
        <button
          type="button"
          className="ue-button ue-button-ghost ue-chat-header-resume"
          onClick={onResumeInterrupted}
        >
          {t.resumeInterrupted}
        </button>
      )}
    </div>
  );
}
