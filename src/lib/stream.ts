export function partialAnswer(raw: string): string {
  const match = raw.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return "";
  }
}
