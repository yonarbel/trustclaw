import { z } from "zod";

export const mashovActionSchema = z.enum([
  "get_timetable",
  "get_bells",
  "get_grades",
  "get_behave_events",
  "get_lessons_history",
  "get_groups",
  "get_messages",
  "get_message",
  "get_child_info",
]);

export const mashovInputSchema = z.object({
  action: mashovActionSchema.describe(
    [
      "Which Mashov endpoint to call.",
      "- get_timetable: weekly class schedule. Pass `day` (1=Sunday..6=Friday) to filter to one day, or `dayOffset` (0=today, 1=tomorrow, etc) to filter relative to today.",
      "- get_bells: bell schedule (start/end time per lesson number).",
      "- get_grades: per-event grades. NOTE: many elementary schools disable parent access to grades, so this often returns empty or 403.",
      "- get_behave_events: behavior/attendance events (absences, late, discipline notes).",
      "- get_lessons_history: log of lessons that already happened, with topic/homework recorded by the teacher. THIS IS WHERE HOMEWORK ASSIGNMENTS USUALLY LIVE for elementary schools.",
      "- get_groups: subject groups the student belongs to (subject + teacher).",
      "- get_messages: parent inbox — messages from teachers/school. Pass `limit` to cap results.",
      "- get_message: full body of a single conversation, requires `conversationId`.",
      "- get_child_info: returns the child's name, class, and child guid (useful for debugging or when the user asks 'who am I checking on?').",
    ].join("\n"),
  ),
  day: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe(
      "For get_timetable only. 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday. Saturday has no school.",
    ),
  dayOffset: z
    .number()
    .int()
    .min(-7)
    .max(7)
    .optional()
    .describe(
      "For get_timetable only. Relative offset from today: 0=today, 1=tomorrow. Convenience alternative to `day`; the tool computes the matching Mashov day number.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("For get_messages only. Max number to return. Default 20."),
  conversationId: z
    .string()
    .optional()
    .describe("For get_message only. The conversation id from get_messages."),
});

export type MashovInput = z.infer<typeof mashovInputSchema>;
