import { useEffect, useRef } from 'react';

/**
 * ConfirmModal — accessible, themed confirmation dialog.
 *
 * Props
 *   open       boolean
 *   onClose    () => void          fired on cancel, backdrop click, or Escape
 *   onConfirm  () => void          fired when the primary button is clicked
 *   title      ReactNode
 *   body       ReactNode
 *   confirmLabel  string (default 'Confirm')
 *   cancelLabel   string (default 'Cancel')
 *   tone       'default' | 'danger' (default 'danger') — colors the primary button
 *   label      string (default '// CONFIRM') — the mono accent line
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  label = '// CONFIRM',
}) {
  const confirmBtnRef = useRef(null);

  // Focus the primary action and trap Escape when open
  useEffect(() => {
    if (!open) return undefined;
    const prevActive = typeof document !== 'undefined' ? document.activeElement : null;
    const t = setTimeout(() => {
      try { confirmBtnRef.current?.focus(); } catch (_) {}
    }, 30);
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    }
    window.addEventListener('keydown', onKey);
    // Lock body scroll while the modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      try { prevActive?.focus?.(); } catch (_) {}
    };
  }, [open, onClose]);

  if (!open) return null;

  const primaryClass = tone === 'danger' ? 'btn-primary' : 'btn-primary';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-900/80 backdrop-blur-md animate-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        className="relative card max-w-md w-full animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crosshair decoration on corners — matches the editorial brutalism */}
        <span className="crosshair top-2 left-2" aria-hidden="true" />
        <span className="crosshair top-2 right-2" aria-hidden="true" />
        <span className="crosshair bottom-2 left-2" aria-hidden="true" />
        <span className="crosshair bottom-2 right-2" aria-hidden="true" />

        <div className="font-body text-xs tracking-[0.24em] text-signal mb-3">
          {label}
        </div>
        <h2
          id="confirm-modal-title"
          className="font-display text-3xl md:text-4xl leading-[0.98] mb-3"
        >
          {title}
        </h2>
        <div className="text-bone-200/75 text-[15px] leading-relaxed mb-7">
          {body}
        </div>
        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={primaryClass + ' flex-1 sm:flex-initial'}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1 sm:flex-initial"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
