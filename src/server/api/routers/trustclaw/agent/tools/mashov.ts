import { zodSchema } from "ai";
import type { Tool } from "ai";
import { withMashov } from "~/server/clients/mashov";
import { mashovInputSchema, type MashovInput } from "./mashov.schema";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function createMashovTool(): Tool<MashovInput, Record<string, unknown>> {
  return {
    description: [
      "Query the student's Mashov (משו\"ב) school portal account.",
      "Use this when the user asks about their schedule, homework, grades,",
      "behavior, study materials, or messages from teachers. Homework",
      "assignments on Mashov typically arrive as messages from teachers,",
      "so check get_messages (with messageType='unread' for new ones) when",
      "the user asks about homework.",
    ].join(" "),
    inputSchema: zodSchema(mashovInputSchema),
    execute: async ({ action, messageType, limit, conversationId }) => {
      try {
        switch (action) {
          case "get_timetable": {
            const timetable = await withMashov((c) => c.getTimetable());
            return {
              lessons: timetable.map((l) => ({
                day: l.day,
                dayName: DAY_NAMES[l.day] ?? `day${l.day}`,
                lesson: l.lesson,
                subject: l.subject,
                teacher: l.teacher,
              })),
            };
          }
          case "get_bells": {
            const bells = await withMashov((c) => c.getBells());
            return { bells };
          }
          case "get_grades": {
            const grades = await withMashov((c) => c.getGrades());
            return { grades };
          }
          case "get_bagrut_grades": {
            const grades = await withMashov((c) => c.getBagrutGrades());
            return { bagrutGrades: grades };
          }
          case "get_behave_events": {
            const events = await withMashov((c) => c.getBehaveEvents());
            return { events };
          }
          case "get_messages": {
            const query = messageType ?? "inbox";
            const conversations = await withMashov((c) =>
              c.getConversations(query, limit ?? 20, 0),
            );
            return {
              conversations: conversations.map((conv) => {
                const head = conv.messages?.[0];
                return {
                  id: conv.id,
                  subject: conv.subject,
                  unread: conv.unread,
                  hasAttachments: conv.hasAttachments,
                  sender: head?.sender,
                  timestamp: head?.timestamp,
                  preview: head?.body
                    ? head.body.slice(0, 280)
                    : undefined,
                };
              }),
            };
          }
          case "get_message": {
            if (!conversationId) {
              return { error: "conversationId is required for get_message" };
            }
            const conversation = await withMashov((c) =>
              c.getConversation(conversationId),
            );
            return { conversation };
          }
          case "get_files": {
            const files = await withMashov((c) => c.getFiles());
            return { files };
          }
          case "get_groups": {
            const groups = await withMashov((c) => c.getGroups());
            return { groups };
          }
          case "get_online_lessons": {
            const lessons = await withMashov((c) => c.getOnlineLessons());
            return { lessons };
          }
        }
      } catch (err) {
        return {
          error:
            err instanceof Error ? err.message : "Mashov request failed",
        };
      }
    },
  };
}
