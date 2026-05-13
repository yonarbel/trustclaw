import { z } from "zod";

export const disconnectInput = z.object({
  toolkit: z.string().min(1),
});

export type DisconnectInput = z.infer<typeof disconnectInput>;
