export function chunkText(text: string, size = 900, overlap = 150): string[] {
  if (size <= overlap || overlap < 0 || size < 1)
    throw new Error("切块参数无效。");
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf("\n", end),
        text.lastIndexOf("。", end),
        text.lastIndexOf(". ", end),
      );
      if (boundary > start + size * 0.6) end = boundary + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end === text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}
