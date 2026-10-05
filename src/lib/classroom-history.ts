/** PostgreSQL transaction timestamps can tie. In a tied legacy turn, the user
 * question must precede the assistant reply; new turns save distinct times. */
export function chronologicalClassroomMessages<
  T extends { role: string; createdAt?: Date },
>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    const delta = a.createdAt.getTime() - b.createdAt.getTime();
    if (delta) return delta;
    return Number(a.role === "assistant") - Number(b.role === "assistant");
  });
}
