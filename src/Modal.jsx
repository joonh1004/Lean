import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
export default function Modal({ title, onClose, children, side = false }) {
  const root = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement,
      regions = [...document.querySelectorAll(".shell>aside,.shell>main")].map(
        (el) => [el, el.hasAttribute("inert")],
      );
    regions.forEach(([el]) => el.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = root.current;
    (
      panel.querySelector("[data-autofocus]") ||
      panel.querySelector("button,input,textarea,select")
    )?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const list = [
          ...panel.querySelectorAll(
            "button,input,textarea,select,a[href],summary",
          ),
        ].filter((el) => !el.disabled && el.offsetParent !== null);
        const first = list[0],
          last = list.at(-1);
        if (!panel.contains(document.activeElement)) {
          e.preventDefault();
          first?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      regions.forEach(([el, was]) => {
        if (!was) el.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
      if (before?.isConnected) before.focus();
    };
  }, []);
  return createPortal(
    <div
      className={`overlay ${side ? "repo-side" : "editor-overlay"}`}
      onClick={() => onClose()}
    >
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          side ? "drawer repo-detail-modal" : "record-editor repo-modal"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
