"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./NavPopup.module.css";

const NAV_ITEMS = [
  { href: "/", icon: "🏠", label: "대시보드" },
  { href: "/library", icon: "🎮", label: "라이브러리" },
  { href: "/add", icon: "＋", label: "게임 등록" },
  { href: "/profile", icon: "👤", label: "프로필" },
  { href: "/settings", icon: "⚙", label: "설정" },
];

/** 항상 펼쳐진 네비게이션이 아니라 팝업. 라이브러리 사이드바와는 별개 개념이다 */
export default function NavPopup() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="메뉴 열기"
        onClick={() => setOpen((prev) => !prev)}
      >
        ☰
      </button>

      {open && (
        <nav className={styles.popup} role="menu">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  className={styles.item}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
