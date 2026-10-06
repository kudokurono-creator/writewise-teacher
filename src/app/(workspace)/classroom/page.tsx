import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { ClassroomChat } from "@/components/classroom-chat";
import { isMockAI } from "@/services/ai/provider";
import type { ClassroomAnswer } from "@/types/lesson";
import { chronologicalClassroomMessages } from "@/lib/classroom-history";
import {
  basicInfoSchema,
  lessonContentSchema,
  getLessons,
} from "@/types/lesson";
export default async function Classroom({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; lessonPlanId?: string }>;
}) {
  const user = await pageUser();
  const { session: id, lessonPlanId: requestedCourse } = await searchParams;
  const [bases, sessions, session, lessons] = await Promise.all([
    db.knowledgeBase.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    }),
    db.chatSession.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    id
      ? db.chatSession.findFirst({
          where: { id, userId: user.id },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : Promise.resolve(null),
    db.lessonPlan.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  if (id && !session) notFound();
  // An opened history entry restores its own binding. An unbound legacy chat
  // stays unbound; only a new chat may default to the latest teaching design.
  const courseId = session
    ? session.lessonPlanId
    : (requestedCourse ?? lessons[0]?.id ?? null);
  if (session && requestedCourse && requestedCourse !== session.lessonPlanId)
    notFound();
  const course = courseId
    ? await db.lessonPlan.findFirst({
        where: { id: courseId, userId: user.id },
        select: { id: true, title: true, basicInfo: true, content: true },
      })
    : null;
  if (courseId && !course) notFound();
  const design = lessonContentSchema.safeParse(course?.content).data;
  const lessonOptions =
    design && course
      ? getLessons(design, basicInfoSchema.parse(course.basicInfo)).map(
          (l, i) => ({ id: l.id, title: `Lesson ${i + 1} · ${l.title}` }),
        )
      : [];
  return (
    <ClassroomChat
      key={`${id || "new"}:${courseId || "unbound"}`}
      course={course ? { id: course.id, title: course.title } : null}
      lessonOptions={lessonOptions}
      lessons={
        course && !lessons.some((l) => l.id === course.id)
          ? [{ id: course.id, title: course.title }, ...lessons]
          : lessons
      }
      bases={bases}
      sessions={sessions}
      mock={isMockAI()}
      initial={
        session
          ? {
              id: session.id,
              baseIds: session.knowledgeBaseIds,
              webSearch: session.webSearch,
              currentLessonId: session.currentLessonId || undefined,
              messages: chronologicalClassroomMessages(session.messages).map(
                (m) => ({
                  role: m.role,
                  content: m.content,
                  answer: m.structured as ClassroomAnswer | undefined,
                }),
              ),
            }
          : undefined
      }
    />
  );
}
