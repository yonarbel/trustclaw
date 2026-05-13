import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { createComposioClient } from "~/server/clients/composio";
import { disconnectInput } from "./disconnect.schema";

export const disconnect = protectedProcedure
  .input(disconnectInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const composio = createComposioClient();

    const accounts = await composio.connectedAccounts.list({
      userIds: [userId],
      toolkitSlugs: [input.toolkit],
    });

    if (accounts.items.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No connected ${input.toolkit} account found`,
      });
    }

    await Promise.all(
      accounts.items.map((account) =>
        composio.connectedAccounts.delete(account.id),
      ),
    );

    return { disconnected: accounts.items.length };
  });
