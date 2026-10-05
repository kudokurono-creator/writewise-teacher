import { api, AppError } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export const DELETE = (request: Request, context: Context) =>
  api(async () => {
    const user = await requireUser();
    // Scope the mutation itself to its owner. ChatMessage is cascade-deleted.
    const result = await db.chatSession.deleteMany({
      where: { id: (await context.params).id, userId: user.id },
    });
    if (!result.count) throw new AppError("对话不存在或已删除。", 404);
    return Response.json({ ok: true });
  })(request);
