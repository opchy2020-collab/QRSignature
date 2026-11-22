// Small messages that appear at the bottom of the screen ("PNG downloaded.").
// They sit in a polite live region so screen readers announce them without interrupting.

import { icon } from "./icon";
import { esc } from "../lib/dom";

export type ToastKind = "success" | "error" | "info";

function region(): HTMLElement {
  let el = document.getElementById("toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "toasts";
    el.className = "toasts";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

/** Make sure the live region exists early, so the first message is announced. */
export function prepareToasts(): void {
  region();
}

export function toast(message: string, kind: ToastKind = "success", milliseconds = 4500): void {
  const item = document.createElement("div");
  item.className = "toast";
  item.dataset.kind = kind;
  const iconId = kind === "error" ? "circleAlert" : kind === "info" ? "sparkles" : "circleCheck";
  item.innerHTML = `${icon(iconId)}<span>${esc(message)}</span>`;
  const host = region();
  host.appendChild(item);
  // Keep at most three on screen.
  while (host.children.length > 3) host.firstElementChild?.remove();
  window.setTimeout(() => item.remove(), milliseconds);
}
