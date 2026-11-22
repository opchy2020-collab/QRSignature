// Draws an icon as inline SVG text. Colour follows the text colour (currentColor).

import { ICONS, type IconId } from "./icons-data";

export type { IconId };

export interface IconOptions {
  /** Extra class names. */
  className?: string;
  /** If set, the icon is announced by screen readers. Otherwise it is hidden from them. */
  label?: string;
}

export function icon(id: IconId, options: IconOptions = {}): string {
  const data = ICONS[id];
  const cls = options.className ? `icon ${options.className}` : "icon";
  const a11y = options.label
    ? `role="img" aria-label="${options.label.replace(/"/g, "&quot;")}"`
    : `aria-hidden="true" focusable="false"`;
  const paint =
    data.mode === "stroke"
      ? `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
      : `fill="currentColor"`;
  return `<svg class="${cls}" viewBox="${data.viewBox}" ${paint} ${a11y}>${data.inner}</svg>`;
}
