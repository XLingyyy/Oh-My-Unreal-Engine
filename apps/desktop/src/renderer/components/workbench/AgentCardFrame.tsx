import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AgentCard,
  LanguageSettings,
} from '@omue/shared-protocol';
import { useDesktopCopy, type DesktopLanguage } from '../../i18n';
import {
  canAutoCollapseAgentCard,
  formatAgentCardTimestamp,
  getAgentCardActor,
} from './agentCardPresentation';

const LONG_CARD_HEIGHT_PX = 320;
const LONG_CARD_TEXT_FALLBACK = 700;

export interface AgentCardPresentationSettings {
  showTimestamps: boolean;
  showAvatars: boolean;
  collapseLongMessages: boolean;
  showActionButtons: boolean;
  language: DesktopLanguage;
  timeFormat: LanguageSettings['timeFormat'];
}

interface AgentCardFrameProps {
  card: AgentCard;
  presentation: AgentCardPresentationSettings;
  hasCriticalActions: boolean;
  children: ReactNode;
}

export function AgentCardFrame({
  card,
  presentation,
  hasCriticalActions,
  children,
}: AgentCardFrameProps) {
  const { copy } = useDesktopCopy();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isLong, setIsLong] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const actor = getAgentCardActor(card.kind);
  const canCollapse = presentation.collapseLongMessages
    && canAutoCollapseAgentCard(card.kind, hasCriticalActions);

  useEffect(() => {
    setIsLong(false);
    setCollapsed(false);
  }, [card.id, presentation.collapseLongMessages]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || !canCollapse) {
      setIsLong(false);
      return undefined;
    }

    const measure = () => {
      const nextIsLong = node.scrollHeight > LONG_CARD_HEIGHT_PX
        || (node.textContent?.length ?? 0) > LONG_CARD_TEXT_FALLBACK;
      setIsLong(nextIsLong);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [canCollapse, card.id]);

  useEffect(() => {
    if (!canCollapse) {
      setCollapsed(false);
      return;
    }
    if (isLong) {
      setCollapsed(true);
    }
  }, [canCollapse, isLong, card.id]);

  const showCollapseToggle = canCollapse && isLong;
  const actionMode = presentation.showActionButtons ? 'normal' : 'hover';
  const formattedTimestamp = formatAgentCardTimestamp(
    card.createdAt,
    presentation.language,
    presentation.timeFormat,
  );

  return (
    <div
      className="ue-card-frame"
      data-actor={actor}
      data-action-mode={actionMode}
      data-critical-actions={String(hasCriticalActions)}
      data-collapsed={String(showCollapseToggle && collapsed)}
    >
      {presentation.showAvatars && (
        <div className="ue-card-frame-avatar-column">
          <span
            className={`ue-card-frame-avatar ue-card-frame-avatar-${actor}`}
            aria-label={actor === 'user' ? 'User' : 'Agent'}
          >
            {actor === 'user' ? 'U' : 'A'}
          </span>
        </div>
      )}
      <div className="ue-card-frame-body">
        {presentation.showTimestamps && (
          <div className="ue-card-frame-meta">
            <time dateTime={card.createdAt}>{formattedTimestamp}</time>
          </div>
        )}
        <div
          ref={contentRef}
          className={`ue-card-frame-content${showCollapseToggle && collapsed ? ' ue-card-frame-content-collapsed' : ''}`}
        >
          {children}
        </div>
        {showCollapseToggle && (
          <button
            type="button"
            className="ue-card-frame-collapse-toggle"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(current => !current)}
          >
            {collapsed
              ? copy.ueAgentUi.cards.expandAria
              : copy.ueAgentUi.cards.collapseAria}
          </button>
        )}
      </div>
    </div>
  );
}
