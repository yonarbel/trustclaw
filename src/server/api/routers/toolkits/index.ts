import { router } from "~/server/api/trpc";
import { getToolkits } from "./getToolkits";
import { getAuthLink } from "./getAuthLink";
import { disconnect } from "./disconnect";

export const toolkitsRouter = router({
  getToolkits,
  getAuthLink,
  disconnect,
});
