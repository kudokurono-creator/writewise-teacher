import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { reflectionSchema } from "@/types/lesson";
import { isMockAI } from "@/services/ai/provider";
import { ReflectionDetail } from "@/components/reflection-workspace";
export default async function Reflection({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await pageUser();
  const reflection = await db.reflection.findFirst({
    where: { id: (await params).id, userId: user.id },
    include: {
      lessonPlan: true,
      documents: { include: { document: { select: { name: true } } } },
    },
  });
  if (!reflection) notFound();
  return (
    <ReflectionDetail
      id={reflection.id}
      title={reflection.title}
      lessonId={reflection.lessonPlanId}
      lessonTitle={reflection.lessonPlan.title}
      sourceVersion={reflection.sourceVersion}
      currentVersion={reflection.lessonPlan.currentVersion}
      notes={reflection.notes}
      initialReport={
        reflection.report ? reflectionSchema.parse(reflection.report) : null
      }
      optimizedVersion={reflection.optimizedVersion}
      documentNames={reflection.documents.map((d) => d.document.name)}
      mock={isMockAI()}
    />
  );
}
