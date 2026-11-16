import { useEffect, useId, useRef, type ReactNode } from 'react';

export function TacticalDialog({
  title,
  eyebrow,
  name,
  onClose,
  children,
  footer,
  className = '',
}: {
  title: string;
  eyebrow: string;
  name: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    return () => {
      element.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`tactical-dialog ${className}`}
      aria-label={name}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={`Close ${name.toLowerCase()}`}
        >
          ×
        </button>
      </header>
      <div className="dialog-content">{children}</div>
      <footer className="dialog-footer">
        {footer ?? (
          <span>
            <kbd>ESC</kbd> BACK TO COMMAND
          </span>
        )}
      </footer>
    </dialog>
  );
}
