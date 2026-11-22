// Templates page: shows all templates as posters, and gives inner page banners their stage colour.

import { qs } from "../lib/dom";
import { styleFromTemplate, stageFor } from "../qr/style";
import { applyStage, renderPosters } from "./templates-ui";

export function initTemplatesPage(): void {
  const grid = qs<HTMLElement>("#all-posters");
  if (grid) renderPosters(grid);
}

/** Banners and call-to-action panels take the colours of a named template. */
export function initStages(): void {
  document.querySelectorAll<HTMLElement>("[data-stage-template]").forEach((el) => {
    const id = el.dataset.stageTemplate ?? "saffron";
    applyStage(el, stageFor(styleFromTemplate(id), id));
  });
}
