import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  classProfileSchema,
  emptyClassProfile,
  type BasicInfo,
} from "@/types/lesson";
import { referenceDocuments } from "@/services/documents/service";
import { generate } from "./service";

export async function resolveClassProfile(
  info: BasicInfo,
  userId: string,
): Promise<BasicInfo> {
  const normalized = {
    ...info,
    referenceScope:
      !info.referenceScope?.trim() || info.referenceScope === "整个 所选 Unit"
        ? info.referenceWholeUnit !== false
          ? `整个 ${info.unit || "所选 Unit"}`
          : info.teachingScope || ""
        : info.referenceScope,
  };
  if (!info.classProfileId) return { ...normalized, classProfile: undefined };
  const record = await db.classProfile.findFirst({
    where: { id: info.classProfileId, userId },
  });
  if (!record) throw new AppError("班级档案不存在。", 404);
  const profile = classProfileSchema.parse(record.profile);
  await referenceDocuments(profile.documentIds, userId);
  return {
    ...normalized,
    grade: profile.grade,
    className: profile.className,
    classProfile: profile,
  };
}

export async function draftClassProfile(userId: string, documentIds: string[]) {
  const documents = await referenceDocuments(documentIds, userId);
  if (!documents.length) throw new AppError("请选择学情文件。");
  const draft = await generate(
    userId,
    "class-profile-analysis",
    {
      documents: documents.map((d) => ({
        name: d.name,
        text: d.text.slice(0, 20000),
      })),
    },
    classProfileSchema,
    () => ({
      ...emptyClassProfile,
      className: "待教师确认",
      documentIds,
      notes:
        "演示模式不能提取实际学情。请查看所选文件，补充并确认班级档案后保存。",
    }),
  );
  return { ...draft, documentIds };
}
