import { z } from "zod";
import {
  lessonDesignSchema,
  syncStages,
  validateDuration,
  type BasicInfo,
  type LessonContent,
} from "@/types/lesson";
import {
  makeCanonical,
  canonicalProjections,
  syncGoalViews,
} from "@/lib/canonical-plan";
import type { ProgressReporter } from "@/types/canonical";
import { generate } from "./service";

export function translationSchema(ids: string[]) {
  return z
    .object({
      texts: z
        .array(z.object({ id: z.string(), text: z.string().max(16000) }))
        .length(ids.length),
    })
    .superRefine((result, ctx) => {
      if (JSON.stringify(result.texts.map((t) => t.id)) !== JSON.stringify(ids))
        ctx.addIssue({
          code: "custom",
          message: "译文必须逐项保留文本 ID 与顺序，不得增删或合并。",
        });
    });
}
export async function withEnglishDesign(
  userId: string,
  info: BasicInfo,
  content: LessonContent,
  progress?: ProgressReporter,
): Promise<LessonContent> {
  const chinese = lessonDesignSchema.parse(
    syncGoalViews(
      syncStages({
        ...content,
        displayInfo: content.displayInfo || {
          ...info,
          title: info.title || "教学设计",
          textbook: info.textbook || "未指定",
          topic: info.topic || "教材任务",
          teachingScope: info.teachingScope || "",
          referenceScope: info.referenceScope || "",
        },
      }),
    ),
  );
  validateDuration(chinese, info);
  const canonical = makeCanonical(chinese);
  const cleanupTexts = Object.entries(canonical.locales.zh)
    .filter(([, text]) =>
      /\b(?:documentId|sourceType|referenceType|coverage|truncated|previousOutput|nextStep|teachingScope|referenceScope)\b/.test(
        text,
      ),
    )
    .map(([id, text]) => ({ id, text }));
  if (cleanupTexts.length) {
    progress?.({
      phase: "bilingual",
      message: "正在校对教案表述与资料来源说明…",
    });
    const cleaned = await generate(
      userId,
      "lesson-plan-language-cleanup",
      { texts: cleanupTexts },
      translationSchema(cleanupTexts.map((t) => t.id)),
      () => ({ texts: cleanupTexts }),
    );
    cleaned.texts.forEach((t) => {
      canonical.locales.zh[t.id] = t.text;
    });
  }
  const english: Record<string, string> = {};
  const previous = content.canonical;
  const previousTranslations = new Map(
    Object.entries(previous?.locales.zh || {}).map(([id, text]) => [
      text,
      previous?.locales.en?.[id],
    ]),
  );
  const pending = Object.entries(canonical.locales.zh).filter(([id, value]) => {
    if (!value) {
      english[id] = "";
      return false;
    }
    if (
      previous?.locales.zh[id] === value &&
      previous.locales.en?.[id] !== undefined
    ) {
      english[id] = previous.locales.en[id];
      return false;
    }
    const cached = previousTranslations.get(value);
    if (cached !== undefined) {
      english[id] = cached;
      return false;
    }
    return true;
  });
  progress?.({
    phase: "bilingual",
    message: "正在生成中英文文本，共享课时、活动、时长与目标结构…",
  });
  const batches = Math.ceil(pending.length / 36);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, batches) }, async () => {
      while (cursor < batches) {
        const offset = cursor++ * 36;
        const texts = pending
          .slice(offset, offset + 36)
          .map(([id, text]) => ({ id, text }));
        const translated = await generate(
          userId,
          "lesson-plan-translation",
          { texts },
          translationSchema(texts.map((t) => t.id)),
          () => ({
            texts: texts.map((t) => ({ ...t, text: demoTranslation(t.text) })),
          }),
        );
        translated.texts.forEach((t) => {
          english[t.id] = t.text;
        });
      }
    }),
  );
  canonical.locales.en = english;
  return {
    ...canonicalProjections(canonical),
    qualitySuggestions: content.qualitySuggestions,
  };
}
// Demo mode never replaces a teacher's meaning with a different generic activity.
// Unknown text is retained verbatim and clearly marked pending translation.
function demoTranslation(text: string) {
  const labels: Record<string, string> = {
    高一: "Grade 10",
    高二: "Grade 11",
    高三: "Grade 12",
    未指定: "Unspecified",
    其他: "Other",
    应用文: "Practical writing",
    议论文: "Argumentative writing",
    读后续写: "Continuation writing",
    概要写作: "Summary writing",
    记叙文: "Narrative writing",
    说明文: "Expository writing",
  };
  return (
    labels[text] ||
    (/[^\x00-\x7f]/.test(text) && /[\u3400-\u9fff]/.test(text)
      ? `Demo translation pending teacher confirmation: ${text}`
      : text)
  );
}
