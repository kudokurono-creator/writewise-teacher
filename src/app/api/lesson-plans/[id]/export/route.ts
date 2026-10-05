import { api } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { ownedLesson } from "@/repositories/lesson";
import { basicInfoSchema, lessonContentSchema } from "@/types/lesson";
import { exportLesson } from "@/services/export/docx";
export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  api(async () => {
    const user = await requireUser();
    const plan = await ownedLesson((await context.params).id, user.id);
    const buffer = await exportLesson(
      basicInfoSchema.parse(plan.basicInfo),
      lessonContentSchema.parse(plan.content),
      user.name,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(plan.title)}.docx`,
        "Cache-Control": "private, no-store",
      },
    });
  })(request);
