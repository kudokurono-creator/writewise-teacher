import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { basicInfoSchema, analysisSchema } from "@/types/lesson";
import { isMockAI } from "@/services/ai/provider";
import { PrepareWizard } from "@/components/prepare-wizard";
export default async function NewPlan({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const user = await pageUser();
  const { draft: id } = await searchParams;
  const [documents, draft] = await Promise.all([
    db.document.findMany({
      where: { userId: user.id },
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
      orderBy: { createdAt: "desc" },
    }),
    id
      ? db.lessonPlan.findFirst({
          where: { id, userId: user.id },
          include: { references: true },
        })
      : Promise.resolve(null),
  ]);
  if (id && !draft) notFound();
  if (draft?.content) redirect(`/lesson-plans/${draft.id}`);
  return (
    <PrepareWizard
      mock={isMockAI()}
      documents={documents.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))}
      draft={
        draft
          ? {
              id: draft.id,
              basicInfo: basicInfoSchema.parse(draft.basicInfo),
              analysis: draft.analysis
                ? analysisSchema.parse(draft.analysis)
                : null,
              documentIds: draft.references.map((r) => r.documentId),
            }
          : undefined
      }
    />
  );
}
