import { z } from "zod";

export const mashovActionSchema = z.enum([
  "get_timetable",
  "get_bells",
  "get_grades",
  "get_bagrut_grades",
  "get_behave_events",
  "get_messages",
  "get_message",
  "get_files",
  "get_groups",
  "get_online_lessons",
]);

export const mashovInputSchema = z.object({
  action: mashovActionSchema.describe(
    [
      "Which Mashov endpoint to call.",
      "- get_timetable: weekly class schedule (day 1=Sunday..6=Friday, lesson is 1-indexed).",
      "- get_bells: bell schedule (start/end time per lesson number).",
      "- get_grades: per-event grades (exams, assignments).",
      "- get_bagrut_grades: matriculation (bagrut) yearly/test/final grades.",
      "- get_behave_events: behavior/attendance events (absences, late, etc).",
      "- get_messages: conversations inbox (use messageType to filter unread/inbox/etc).",
      "- get_message: full body of a single conversation by id.",
      "- get_files: study materials uploaded by teachers.",
      "- get_groups: class groups the student belongs to.",
      "- get_online_lessons: live online lessons (zoom-style links).",
    ].join("\n"),
  ),
  messageType: z
    .enum(["inbox", "unread", "archive", "deleted", "sent", "draft"])
    .optional()
    .describe("For get_messages only. Defaults to 'inbox'."),
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
