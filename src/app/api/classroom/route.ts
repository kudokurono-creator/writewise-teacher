import { api } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { chatInputSchema, classroomStream } from "@/services/ai/classroom";
export const POST = api(async (request) => {
  const user = await requireUser();
  const data = chatInputSchema.parse(await request.json());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await classroomStream(user.id, data, emit);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
