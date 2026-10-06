import {
  lessonDesignSchema,
  syncStages,
  type LessonDesign,
  type LessonContent,
} from "@/types/lesson";
import type { CanonicalNode, CanonicalPlan } from "@/types/canonical";

const structuralFields = new Set([
  "id",
  "objectiveIds",
  "resourceIds",
  "inputFromActivityIds",
  "kind",
  "actor",
  "grouping",
  "documentId",
  "scope",
  "purpose",
]);
export function syncGoalViews<T extends LessonDesign>(design: T): T {
  if (!design.goals) return design;
  return {
    ...design,
    objectives: design.goals.map((g) => g.text),
    lessons: design.lessons?.map((l) => ({
      ...l,
      objectives: l.objectiveIds.map(
        (id, i) =>
          design.goals!.find((g) => g.id === id)?.text || l.objectives[i],
      ),
    })),
  };
}
export function makeCanonical(design: LessonDesign): CanonicalPlan {
  const locales: CanonicalPlan["locales"] = { zh: {} };
  const sharedTexts = new Map<string, string>();
  const walk = (value: unknown, path: string, field: string): CanonicalNode => {
    if (typeof value === "string") {
      if (
        structuralFields.has(field) &&
        !(field === "purpose" && !path.includes("sourceBindings"))
      )
        return value;
      const textId = sharedTexts.get(value) || path;
      sharedTexts.set(value, textId);
      locales.zh[textId] = value;
      return { textId };
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    )
      return value;
    if (Array.isArray(value))
      return value.map((item, i) => walk(item, `${path}/${i}`, field));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, walk(item, `${path}/${key}`, key)]),
      );
    throw new Error(`教案字段 ${path} 不可保存。`);
  };
  const source = lessonDesignSchema.parse(syncStages(design));
  const { stages, ...withoutStages } = source;
  return {
    version: 2,
    structure: walk(
      source.lessons ? withoutStages : { ...withoutStages, stages },
      "plan",
      "",
    ),
    locales,
  };
}
export function renderCanonical(
  canonical: CanonicalPlan,
  language: "zh" | "en",
): LessonDesign {
  const dictionary = canonical.locales[language];
  if (!dictionary) throw new Error("英文版尚未生成，请先生成英文对应版本。");
  const walk = (node: CanonicalNode): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      if (Object.keys(node).length === 1 && typeof node.textId === "string") {
        if (!(node.textId in dictionary))
          throw new Error(`语言文本缺少 ${node.textId}。`);
        return dictionary[node.textId];
      }
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, walk(value)]),
      );
    }
    return node;
  };
  const raw = walk(canonical.structure);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("教案结构无效。");
  const parsed = lessonDesignSchema.partial({ stages: true }).parse(raw);
  return lessonDesignSchema.parse(
    syncStages({ ...parsed, stages: parsed.stages || [] }),
  );
}
export function designView(
  content: LessonContent,
  language: "zh" | "en",
): LessonDesign {
  return content.canonical
    ? renderCanonical(content.canonical, language)
    : language === "en"
      ? lessonDesignSchema.parse(content.english)
      : content;
}
export function canonicalProjections(canonical: CanonicalPlan): LessonContent {
  const zh = renderCanonical(canonical, "zh");
  return {
    ...zh,
    canonical,
    english: canonical.locales.en
      ? renderCanonical(canonical, "en")
      : undefined,
  };
}
export function assertCanonicalProjections(content: LessonContent) {
  if (!content.canonical) return;
  const projected = canonicalProjections(content.canonical);
  if (
    JSON.stringify(lessonDesignSchema.parse(content)) !==
      JSON.stringify(lessonDesignSchema.parse(projected)) ||
    JSON.stringify(content.english) !== JSON.stringify(projected.english)
  )
    throw new Error("中英文视图与共享教案结构不一致，请刷新后重试。");
}
