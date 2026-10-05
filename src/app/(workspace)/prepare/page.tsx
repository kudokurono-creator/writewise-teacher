import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { basicInfoSchema } from "@/types/lesson";
import { PageHeading } from "@/components/shared";
import { LessonLibrary } from "@/components/lesson-library";
export default async function Prepare() {
  const user = await pageUser();
  const plans = await db.lessonPlan.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeading
        title="课前备课"
        description="让资料、学情与教学目标，落到每一个课堂活动中。"
      />
      <LessonLibrary
        prepare
        plans={plans.map((p) => ({
          ...p,
          basicInfo: basicInfoSchema.parse(p.basicInfo),
          content: !!p.content,
          updatedAt: p.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
