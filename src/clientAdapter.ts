import { getUiCapability, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { ClientCapabilities } from "@modelcontextprotocol/server";

export type ClientAdapter = "mcp-apps" | "antigravity" | "markdown";

export function detectClientAdapter(
  clientInfo: { name: string } | undefined,
  clientCapabilities: ClientCapabilities | undefined,
  envOverride?: string,
): ClientAdapter {
  if (getUiCapability(clientCapabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE)) return "mcp-apps";
  if (envOverride?.toLowerCase() === "antigravity" || /antigravity|jetski|cascade/i.test(clientInfo?.name ?? "")) {
    return "antigravity";
  }
  return "markdown";
}
