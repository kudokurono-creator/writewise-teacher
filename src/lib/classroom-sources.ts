import type { KnowledgeSource } from "@/types/lesson";

export type ReferenceDocument = {
  documentId: string;
  documentName: string;
  quotations: string[];
};

/** Presentation only: preserve the retrieval results used for generation. */
export function groupClassroomSources(
  sources: KnowledgeSource[],
): ReferenceDocument[] {
  const documents = new Map<string, ReferenceDocument>();
  const seenIds = new Map<string, Set<string>>();
  const seenTexts = new Map<string, Set<string>>();
  for (const source of sources) {
    const quotation = (source.content || source.excerpt).trim();
    if (!quotation) continue;
    const normalized = quotation.replace(/\s+/g, " ");
    if (!documents.has(source.documentId)) {
      documents.set(source.documentId, {
        documentId: source.documentId,
        documentName: source.documentName,
        quotations: [],
      });
      seenIds.set(source.documentId, new Set());
      seenTexts.set(source.documentId, new Set());
    }
    const ids = seenIds.get(source.documentId)!;
    const texts = seenTexts.get(source.documentId)!;
    if ((source.chunkId && ids.has(source.chunkId)) || texts.has(normalized))
      continue;
    ids.add(source.chunkId);
    texts.add(normalized);
    documents.get(source.documentId)!.quotations.push(quotation);
  }
  return [...documents.values()];
}
