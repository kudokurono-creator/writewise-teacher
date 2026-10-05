import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { ReflectionWorkspace } from "@/components/reflection-workspace";
export default async function Reflections({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const user = await pageUser();
  const { lesson } = await searchParams;
  const [reflections, plans, documents] = await Promise.all([
    db.reflection.findMany({
      where: { userId: user.id },
      include: { lessonPlan: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.lessonPlan.findMany({
      where: { userId: user.id, status: "READY" },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.document.findMany({
      where: { userId: user.id, status: "READY" },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        status: true,
        error: true,
        createdAt: true,
        knowledgeBase: { select: { name: true } },
      },
    }),
  ]);
  return (
    <ReflectionWorkspace
      selectedLesson={plans.some((p) => p.id === lesson) ? lesson : undefined}
      plans={plans}
      documents={documents.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))}
      reflections={reflections.map((r) => ({
        ...r,
        lessonTitle: r.lessonPlan.title,
        hasReport: !!r.report,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
