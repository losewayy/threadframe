import type { UiSpec } from "./schema/uiSpec.js";

export function injectStandaloneHtml(bundleHtml: string, spec: UiSpec, options?: { embed?: boolean }): string {
  const anchor = '<main id="app-root"></main>';
  if (!bundleHtml.includes(anchor)) throw new Error("UI bundle is missing its app-root anchor");
  // Escape every opening bracket so JSON cannot alter the HTML script parser state.
  const json = JSON.stringify(spec).replace(/</g, "\\u003c");
  const embed = options?.embed ? "window.__THREADFRAME_EMBED__ = true;" : "";
  return bundleHtml.replace(anchor, () => `${anchor}\n<script>window.__THREADFRAME_SPEC__ = ${json};${embed}</script>`);
}
