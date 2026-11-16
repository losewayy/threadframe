import { applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";

export function syncHostStyles(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  const fonts = ctx.styles?.css?.fonts;
  if (fonts) {
    // Host font faces may use installed fonts, but must never trigger network loads.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(fonts);
    const localFaces = [...sheet.cssRules].filter((rule) => rule.type === CSSRule.FONT_FACE_RULE
      && !/url\s*\(|@import/i.test(rule.cssText)).map((rule) => rule.cssText);
    if (localFaces.length) applyHostFonts(localFaces.join("\n"));
  }
}
