import { useEffect, useId, useRef } from 'react';
import type { ReactElement } from 'react';
import { useDesktopCopy } from '../../i18n';

export type ConfirmModalVariant = 'info' | 'warning' | 'danger';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  assetPaths?: string[];
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmModalVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  assetPaths,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: ConfirmModalProps): ReactElement | null {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.confirm;
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const focusTimer = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  useEffect(() => {
    if (open) return;
    const target = lastFocusedRef.current;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }, [open]);

  if (!open) return null;

  const variantClass = `ue-confirm-modal ue-confirm-modal-${variant}`;

  const handleBackdropClick = () => {
    onCancel();
  };

  const handleDialogClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div
      className="ue-confirm-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={variantClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={handleDialogClick}
      >
        <header className="ue-confirm-modal-header">
          <h2 id={titleId} className="ue-confirm-modal-title">{title}</h2>
          <button
            type="button"
            className="ue-confirm-modal-close"
            aria-label={t.closeAria}
            onClick={handleCancel}
          >
            ×
          </button>
        </header>
        <div className="ue-confirm-modal-body">
          <p id={messageId} className="ue-confirm-modal-message">{message}</p>
          {assetPaths && assetPaths.length > 0 && (
            <section className="ue-confirm-modal-assets" aria-label={t.firstPromoteAssetListLabel}>
              <ul className="ue-confirm-modal-asset-list">
                {assetPaths.map(path => (
                  <li key={path} className="ue-confirm-modal-asset-item">
                    <code>{path}</code>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="ue-confirm-modal-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="ue-confirm-modal-btn ue-confirm-modal-btn-cancel"
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ue-confirm-modal-btn ue-confirm-modal-btn-confirm ue-confirm-modal-btn-${variant}`}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
