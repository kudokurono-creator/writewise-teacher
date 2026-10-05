import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { LessonContent } from "@/types/lesson";
export async function ownedLesson(id: string, userId: string) {
  const plan = await db.lessonPlan.findFirst({
    where: { id, userId },
    include: {
      references: { include: { document: true } },
      versions: { orderBy: { number: "desc" } },
    },
  });
  if (!plan) throw new AppError("教学设计不存在。", 404);
  return plan;
}
export async function saveVersion(
  id: string,
  userId: string,
  content: LessonContent,
  expectedVersion: number,
  description: string,
) {
  return db.$transaction(async (tx) => {
    const update = await tx.lessonPlan.updateMany({
      where: { id, userId, currentVersion: expectedVersion },
      data: {
        content: json(content),
        currentVersion: { increment: 1 },
        status: "READY",
      },
    });
    if (update.count !== 1)
      throw new AppError(
        "教案已在其他页面更新。请刷新后再保存，避免覆盖修改。",
        409,
      );
    const number = expectedVersion + 1;
    await tx.lessonPlanVersion.create({
      data: {
        lessonPlanId: id,
        number,
        content: json(content),
        changeDescription: description,
      },
    });
    return { number, content };
  });
}
