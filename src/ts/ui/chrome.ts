// Things every page has: the mobile menu, the shadow under the bar after scrolling, back-to-top.

import { prepareToasts } from "./toast";
import { qs } from "../lib/dom";

export function initChrome(): void {
  prepareToasts();

  const navbar = qs<HTMLElement>(".navbar");
  const toggle = qs<HTMLButtonElement>(".navbar-toggle");
  const menu = qs<HTMLElement>("#site-menu");
  const toTop = qs<HTMLButtonElement>(".back-to-top");

  const setOpen = (open: boolean) => {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("is-open", open);
  };

  toggle?.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  menu?.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 769px)").addEventListener("change", (e) => {
    if (e.matches) setOpen(false);
  });

  const onScroll = () => {
    navbar?.classList.toggle("scrolled", window.scrollY > 4);
    toTop?.classList.toggle("is-visible", window.scrollY > 500);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  toTop?.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
}
