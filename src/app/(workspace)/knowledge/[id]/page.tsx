import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { KnowledgeDetail } from "@/components/knowledge-workspace";
export default async function Base({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await pageUser();
  const base = await db.knowledgeBase.findFirst({
    where: { id: (await params).id, userId: user.id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { chunks: true } } },
      },
    },
  });
  if (!base) notFound();
  return (
    <KnowledgeDetail
      base={{
        ...base,
        documentCount: base.documents.length,
        createdAt: base.createdAt.toISOString(),
      }}
      documents={base.documents.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        size: d.size,
        status: d.status,
        error: d.error,
        chunkCount: d._count.chunks,
        createdAt: d.createdAt.toISOString(),
      }))}
    />
  );
}
