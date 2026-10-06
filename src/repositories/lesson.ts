import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertCanonicalProjections } from "@/lib/canonical-plan";
import { validateDesign } from "@/services/ai/design-validation";
import { documentSelectionSchema } from "@/types/canonical";
import {
  basicInfoSchema,
  validateDuration,
  assertMatchingVersions,
  type LessonContent,
} from "@/types/lesson";
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
  const plan = await ownedLesson(id, userId);
  const info = basicInfoSchema.parse(plan.basicInfo);
  assertCanonicalProjections(content);
  validateDuration(content, info);
  if (info.workflowVersion === 2) {
    const validation = validateDesign(
      content,
      info,
      true,
      plan.references.map((r) => documentSelectionSchema.parse(r)),
    );
    if (validation.hard.length)
      throw new AppError(
        validation.hard
          .slice(0, 3)
          .map((i) => `${i.message}（预期 ${i.expected}，实际 ${i.actual}）`)
          .join("；"),
      );
    content = {
      ...content,
      qualitySuggestions: validation.soft.map((i) => ({
        path: i.path,
        message: i.message,
      })),
    };
  }
  if (content.english) {
    validateDuration(content.english, info);
    assertMatchingVersions(content, content.english);
  }
  return db.$transaction(async (tx) => {
    const update = await tx.lessonPlan.updateMany({
      where: { id, userId, currentVersion: expectedVersion },
      data: {
        content: json(content),
        currentVersion: { increment: 1 },
        status: "READY",
        draftStep: 6,
        ...(content.displayInfo?.title
          ? { title: content.displayInfo.title }
          : {}),
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
