import { api } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { ownedLesson } from "@/repositories/lesson";
import { basicInfoSchema, lessonContentSchema } from "@/types/lesson";
import { exportLesson } from "@/services/export/docx";
import { z } from "zod";
import { AppError } from "@/lib/errors";
export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) =>
  api(async () => {
    const user = await requireUser();
    const plan = await ownedLesson((await context.params).id, user.id);
    const language = z
      .enum(["zh", "en"])
      .parse(new URL(request.url).searchParams.get("language") || "en");
    const content = lessonContentSchema.parse(plan.content);
    if (language === "en" && !content.english)
      throw new AppError("英文版尚未生成，请先生成英文对应版本。", 409);
    const buffer = await exportLesson(
      basicInfoSchema.parse(plan.basicInfo),
      content,
      user.name,
      language,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${plan.title}_${language === "en" ? "English" : "中文版"}`)}.docx`,
        "Cache-Control": "private, no-store",
      },
    });
  })(request);
