import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
export default async function Knowledge() {
  const user = await pageUser();
  const bases = await db.knowledgeBase.findMany({
    where: { userId: user.id },
    include: { _count: { select: { documents: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <KnowledgeWorkspace
      bases={bases.map((b) => ({
        ...b,
        documentCount: b._count.documents,
        createdAt: b.createdAt.toISOString(),
      }))}
    />
  );
}
