import { notFound, redirect } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { basicInfoSchema, lessonContentSchema } from "@/types/lesson";
import { LessonEditor } from "@/components/lesson-editor";
import { isMockAI } from "@/services/ai/provider";
export default async function Plan({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await pageUser();
  const { id } = await params;
  const plan = await db.lessonPlan.findFirst({
    where: { id, userId: user.id },
    include: {
      versions: { orderBy: { number: "desc" } },
      references: {
        include: { document: { select: { name: true, id: true } } },
      },
    },
  });
  if (!plan) notFound();
  if (!plan.content) redirect(`/prepare/new?draft=${id}`);
  return (
    <LessonEditor
      id={id}
      info={basicInfoSchema.parse(plan.basicInfo)}
      initialContent={lessonContentSchema.parse(plan.content)}
      initialVersion={plan.currentVersion}
      versions={plan.versions.map((v) => ({
        ...v,
        content: lessonContentSchema.parse(v.content),
        createdAt: v.createdAt.toISOString(),
      }))}
      references={plan.references.map((r) => r.document)}
      mock={isMockAI()}
    />
  );
}
