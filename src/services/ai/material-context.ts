import type { BasicInfo } from "@/types/lesson";
import { referenceDocuments } from "@/services/documents/service";

export function textbookExcerpt(text: string, info: BasicInfo, limit = 24000) {
  const unit = info.unit.match(/Unit\s*(\d+)/i)?.[1];
  let selected = text;
  let coverage = "所选文件文本";
  if (unit) {
    const headings = [...text.matchAll(/(?:^|\n)\s*Unit\s+(\d+)\b/gi)];
    const start = headings.findIndex((match) => match[1] === unit);
    if (start >= 0) {
      selected = text.slice(
        headings[start].index,
        headings[start + 1]?.index ?? text.length,
      );
      coverage = `文本中明确标注的 Unit ${unit} 范围（仍需核实资料完整性）`;
    }
  }
  if (selected.length <= limit)
    return { text: selected, coverage, truncated: false };
  const keywords = [
    info.teachingScope,
    info.topic,
    ...(info.teachingScope?.match(/\d+/g) || []),
  ].filter(Boolean) as string[];
  const chunks = selected.split(/\f|(?=\n(?:Page|P\s*\d|第\s*\d+\s*页))/i);
  const relevant = chunks.filter((chunk) =>
    keywords.some((key) => chunk.toLowerCase().includes(key.toLowerCase())),
  );
  return {
    text: (relevant.length ? relevant.join("\n") : selected).slice(0, limit),
    coverage: `${coverage}的有限摘录，省略部分未读取`,
    truncated: true,
  };
}

export async function lessonReferences(
  plan: {
    references: {
      sourceType?: string;
      referenceType?: string;
      document: { id: string; name: string; text: string };
    }[];
  },
  info: BasicInfo,
  userId: string,
) {
  const classDocs = info.classProfile?.documentIds.length
    ? await referenceDocuments(info.classProfile.documentIds, userId)
    : [];
  const entries = [
    ...plan.references,
    ...classDocs
      .filter((d) => !plan.references.some((r) => r.document.id === d.id))
      .map((document) => ({
        document,
        sourceType: "reference",
        referenceType: "student_profile",
      })),
  ];
  const docs = [
    ...new Map(entries.map((entry) => [entry.document.id, entry])).values(),
  ];
  return docs.map(({ document: doc, sourceType, referenceType }) => ({
    name: doc.name,
    documentId: doc.id,
    sourceType: sourceType || "reference",
    referenceType: referenceType || "other",
    legacyUnclassified:
      !sourceType ||
      (sourceType === "reference" &&
        (!referenceType || referenceType === "other")),
    ...(sourceType === "textbook"
      ? textbookExcerpt(
          doc.text,
          info,
          Math.max(1000, Math.floor(80000 / Math.max(docs.length, 1))),
        )
      : {
          text: doc.text.slice(
            0,
            Math.min(
              20000,
              Math.max(1000, Math.floor(80000 / Math.max(docs.length, 1))),
            ),
          ),
          coverage: "参考资料，不能覆盖教材范围",
          truncated:
            doc.text.length >
            Math.min(
              20000,
              Math.max(1000, Math.floor(80000 / Math.max(docs.length, 1))),
            ),
        }),
  }));
}
