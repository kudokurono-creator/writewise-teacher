import { AppError } from "@/lib/errors";
import type { DocumentSelection } from "@/types/canonical";
import { referenceDocuments } from "./service";
export async function checkedSelections(
  selections: DocumentSelection[],
  userId: string,
) {
  if (new Set(selections.map((s) => s.documentId)).size !== selections.length)
    throw new AppError("同一资料只能选择一种用途，请移除重复选择。");
  await referenceDocuments(
    selections.map((s) => s.documentId),
    userId,
  );
  return selections;
}
