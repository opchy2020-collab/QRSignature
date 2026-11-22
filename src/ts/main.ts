// Entry point. Every page loads the same script; the <body data-page="..."> tag says which parts to start.

import { initChrome } from "./ui/chrome";
import { initHome } from "./ui/home";
import { initStudio } from "./ui/studio";
import { initStages, initTemplatesPage } from "./ui/templates-page";

function start(): void {
  initChrome();
  initStages();
  switch (document.body.dataset.page) {
    case "home":
      initHome();
      break;
    case "create":
      initStudio();
      break;
    case "templates":
      initTemplatesPage();
      break;
    default:
      break;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
