import type { ToolSet } from "ai";
import { isMashovConfigured } from "~/server/clients/mashov";
import { createMemorySaveTool } from "./memory-save";
import { createMemorySearchTool } from "./memory-search";
import { createScheduleTool } from "./schedule";
import { createMashovTool } from "./mashov";
export { searchMemoriesForContext } from "./memory-search";

export function createCustomTools(
  instanceId: string,
  userTimezone = "UTC",
): ToolSet {
  const tools: ToolSet = {
    memory_save: createMemorySaveTool(instanceId),
    memory_search: createMemorySearchTool(instanceId),
    schedule: createScheduleTool(instanceId, userTimezone),
  };
  if (isMashovConfigured()) {
    tools.mashov = createMashovTool(userTimezone);
  }
  return tools;
}
