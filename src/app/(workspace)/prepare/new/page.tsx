import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import {
  basicInfoSchema,
  analysisSchema,
  classProfileSchema,
} from "@/types/lesson";
import { isMockAI } from "@/services/ai/provider";
import { PrepareWizard } from "@/components/prepare-wizard";
export default async function NewPlan({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const user = await pageUser();
  const { draft: id } = await searchParams;
  const [documents, draft, profiles] = await Promise.all([
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
    db.classProfile.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  if (id && !draft) notFound();
  if (draft?.content) redirect(`/lesson-plans/${draft.id}`);
  return (
    <PrepareWizard
      mock={isMockAI()}
      profiles={profiles.map((p) => ({
        id: p.id,
        profile: classProfileSchema.parse(p.profile),
      }))}
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
              documentSelections: draft.references.map((r) => ({
                documentId: r.documentId,
                sourceType:
                  r.sourceType === "textbook"
                    ? ("textbook" as const)
                    : ("reference" as const),
                referenceType: r.referenceType,
              })),
              draftStep: draft.draftStep,
              conversation: draft.analysisConversation,
            }
          : undefined
      }
    />
  );
}
