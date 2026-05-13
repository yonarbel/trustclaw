import { zodSchema } from "ai";
import type { Tool } from "ai";
import { mashovGet, getMashovSession } from "~/server/clients/mashov";
import { mashovInputSchema, type MashovInput } from "./mashov.schema";

const DAY_NAMES_EN = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

const DAY_NAMES_HE = [
  "שבת",
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
] as const;

interface TimetableEntry {
  timeTable: { groupId: number; day: number; lesson: number };
  groupDetails: {
    groupId: number;
    groupName: string;
    subjectName: string;
    groupTeachers: { teacherGuid: string; teacherName: string }[];
  };
}

interface BellEntry {
  lessonNumber: number;
  startTime: string;
  endTime: string;
}

interface BehaveEntry {
  eventCode: number;
  achva: string;
  achvaCode: number;
  achvaName: string;
  justified: boolean;
  justification: string;
  lessonId: number;
  reporter: string;
  lessonDate: string;
  lesson: number;
  groupId: number;
  subject: string;
  remark: string;
  timestamp: string;
}

interface LessonHistoryEntry {
  lessonId: number;
  lessonDate: string;
  lesson: number;
  groupId: number;
  subject: string;
  remark?: string;
  homework?: string;
}

interface GroupEntry {
  groupId: number;
  groupName: string;
  subjectName: string;
  groupTeachers: { teacherGuid: string; teacherName: string }[];
}

interface ConversationSummary {
  conversationId: string;
  subject?: string;
  isNew?: boolean;
  hasAttachments?: boolean;
  messages?: number;
  participants?: { name: string }[];
  updated?: string;
  messageDate?: string;
  sendDate?: string;
  body?: string;
}

interface GradeEntry {
  gradingEventGroupId?: number;
  gradeType?: string;
  grade?: string | number;
  gradingEvent?: string;
  eventDate?: string;
  subjectName?: string;
  teacherName?: string;
}

/**
 * Convert an "HH:MM:SS" string to minutes-since-midnight. Returns null
 * for malformed input.
 */
function timeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Compute the Mashov day number for "today + offset" in the given IANA timezone.
 * Returns null if the resulting day is Saturday (no school).
 */
function dayOffsetToMashovDay(offset: number, timezone: string): number | null {
  const target = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  // Get the weekday in the user's local timezone, not UTC.
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  }).format(target);
  const map: Record<string, number> = {
    Sunday: 1,
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6,
    Saturday: 7,
  };
  const day = map[weekdayName];
  if (day === undefined || day === 7) return null;
  return day;
}

export function createMashovTool(
  userTimezone = "UTC",
): Tool<MashovInput, Record<string, unknown>> {
  return {
    description: [
      "Query the student's Mashov (משו\"ב) school portal account.",
      "Use this when the user asks about their schedule, homework, grades,",
      "behavior, attendance, study materials, or messages from teachers.",
      "For homework specifically: elementary teachers usually record homework",
      "in the lesson log, so check get_lessons_history for recent lessons,",
      "OR get_messages for explicit announcements.",
      "Day numbers: 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday,",
      "6=Friday. Saturday has no school in Israel.",
    ].join(" "),
    inputSchema: zodSchema(mashovInputSchema),
    execute: async ({ action, day, dayOffset, limit, conversationId }) => {
      try {
        switch (action) {
          case "get_child_info": {
            const session = await getMashovSession();
            return {
              child: {
                name: `${session.child.privateName} ${session.child.familyName}`,
                class: `${session.child.classCode}${session.child.classNum}`,
                childGuid: session.child.childGuid,
              },
              otherChildrenOnAccount: session.children
                .filter((c) => c.childGuid !== session.child.childGuid)
                .map((c) => ({
                  name: `${c.privateName} ${c.familyName}`,
                  class: `${c.classCode}${c.classNum}`,
                  childGuid: c.childGuid,
                })),
            };
          }

          case "get_timetable": {
            const session = await getMashovSession();
            // Fetch timetable + bells in parallel so we can attach start/end
            // times to each lesson — saves the agent a second tool call.
            const [entries, bells] = await Promise.all([
              mashovGet<TimetableEntry[]>({
                path: (s) => `/students/${s.child.childGuid}/timetable`,
              }),
              mashovGet<BellEntry[]>({ path: () => `/bells` }).catch(
                () => [] as BellEntry[],
              ),
            ]);
            const bellByLesson = new Map(
              bells.map((b) => [
                b.lessonNumber,
                { startTime: b.startTime, endTime: b.endTime },
              ]),
            );

            let resolvedDay: number | null = null;
            if (day !== undefined) {
              resolvedDay = day;
            } else if (dayOffset !== undefined) {
              resolvedDay = dayOffsetToMashovDay(dayOffset, userTimezone);
              if (resolvedDay === null) {
                return {
                  child: `${session.child.privateName} ${session.child.familyName}`,
                  message:
                    "The requested day is Saturday — there are no school lessons in Israel on Saturday.",
                  lessons: [],
                };
              }
            }

            const filtered =
              resolvedDay !== null
                ? entries.filter((e) => e.timeTable.day === resolvedDay)
                : entries;

            const lessons = filtered
              .map((e) => {
                const bell = bellByLesson.get(e.timeTable.lesson);
                return {
                  day: e.timeTable.day,
                  dayNameEn:
                    DAY_NAMES_EN[e.timeTable.day] ?? `day${e.timeTable.day}`,
                  dayNameHe:
                    DAY_NAMES_HE[e.timeTable.day] ?? `יום${e.timeTable.day}`,
                  lesson: e.timeTable.lesson,
                  startTime: bell?.startTime,
                  endTime: bell?.endTime,
                  subject: e.groupDetails.subjectName,
                  groupName: e.groupDetails.groupName,
                  teacher: e.groupDetails.groupTeachers[0]?.teacherName,
                };
              })
              .sort((a, b) =>
                a.day !== b.day ? a.day - b.day : a.lesson - b.lesson,
              );

            // Annotate each lesson with the break that follows it, when the
            // next lesson on the same day starts >= 10 minutes after this
            // one ends. Short (~5min) transitions are not real breaks.
            type LessonRow = (typeof lessons)[number] & {
              breakAfter?: { durationMinutes: number; until: string };
            };
            const annotated: LessonRow[] = lessons;
            for (let i = 0; i < annotated.length - 1; i++) {
              const current = annotated[i]!;
              const next = annotated[i + 1]!;
              if (current.day !== next.day) continue;
              const endMin = timeToMinutes(current.endTime);
              const nextStartMin = timeToMinutes(next.startTime);
              if (endMin === null || nextStartMin === null) continue;
              const gap = nextStartMin - endMin;
              if (gap >= 10 && next.startTime) {
                current.breakAfter = {
                  durationMinutes: gap,
                  until: next.startTime,
                };
              }
            }

            return {
              child: `${session.child.privateName} ${session.child.familyName}`,
              class: `${session.child.classCode}${session.child.classNum}`,
              filteredByDay: resolvedDay,
              lessons: annotated,
            };
          }

          case "get_bells": {
            const bells = await mashovGet<BellEntry[]>({
              path: () => `/bells`,
            });
            return { bells };
          }

          case "get_grades": {
            const grades = await mashovGet<GradeEntry[]>({
              path: (s) => `/students/${s.child.childGuid}/grades`,
            }).catch((err) => {
              return [
                {
                  _error:
                    err instanceof Error ? err.message : "grades unavailable",
                  _note:
                    "Some schools disable parent access to grades — this may be expected.",
                },
              ];
            });
            return { grades };
          }

          case "get_behave_events": {
            const events = await mashovGet<BehaveEntry[]>({
              path: (s) => `/students/${s.child.childGuid}/behave`,
            });
            return {
              events: events.map((e) => ({
                date: e.lessonDate,
                lesson: e.lesson,
                subject: e.subject,
                type: e.achva,
                justified: e.justified,
                justification: e.justification,
                remark: e.remark,
                reporter: e.reporter,
              })),
            };
          }

          case "get_lessons_history": {
            const lessons = await mashovGet<LessonHistoryEntry[]>({
              path: (s) => `/students/${s.child.childGuid}/lessonshistory`,
            });
            return {
              lessons: lessons
                .filter((l) => {
                  const hasHomework = Boolean(
                    l.homework && l.homework.length > 0,
                  );
                  const hasRemark = Boolean(l.remark && l.remark.length > 0);
                  return hasHomework || hasRemark;
                })
                .map((l) => ({
                  date: l.lessonDate,
                  lesson: l.lesson,
                  subject: l.subject,
                  remark: l.remark,
                  homework: l.homework,
                })),
              note:
                "Only lessons with a recorded homework or remark are returned. Use this to find homework assignments.",
            };
          }

          case "get_groups": {
            const groups = await mashovGet<GroupEntry[]>({
              path: (s) => `/students/${s.child.childGuid}/groups`,
            });
            return {
              groups: groups.map((g) => ({
                subject: g.subjectName,
                groupName: g.groupName,
                teacher: g.groupTeachers[0]?.teacherName,
              })),
            };
          }

          case "get_messages": {
            const conversations = await mashovGet<ConversationSummary[]>({
              path: () => `/mail/inbox/conversations`,
              query: { skip: 0, take: limit ?? 20 },
            });
            return {
              conversations: conversations.map((c) => ({
                id: c.conversationId,
                subject: c.subject,
                isNew: c.isNew,
                hasAttachments: c.hasAttachments,
                messageCount: c.messages,
                sender: c.participants?.[0]?.name,
                date: c.messageDate ?? c.sendDate ?? c.updated,
                preview: c.body?.slice(0, 280),
              })),
            };
          }

          case "get_message": {
            if (!conversationId) {
              return { error: "conversationId is required for get_message" };
            }
            const conversation = await mashovGet<unknown>({
              path: () => `/mail/conversations/${conversationId}`,
            });
            return { conversation };
          }
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Mashov request failed",
        };
      }
    },
  };
}
