"use client";

import { useEffect, type ReactNode } from "react";
import styles from "./Dialog.module.css";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
};

export default function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </header>

        {children && <div className={styles.body}>{children}</div>}
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
