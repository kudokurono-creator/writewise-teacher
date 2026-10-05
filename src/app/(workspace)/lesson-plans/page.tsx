import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/auth";
import { basicInfoSchema } from "@/types/lesson";
import { PageHeading } from "@/components/shared";
import { LessonLibrary } from "@/components/lesson-library";
import { Button } from "@/components/ui/button";
export default async function LessonPlans() {
  const user = await pageUser();
  const plans = await db.lessonPlan.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeading
        title="教学设计"
        description="保存每一次备课思考，持续完善你的写作课堂。"
        action={
          <Button asChild>
            <Link href="/prepare/new">
              <Plus size={17} />
              新建教学设计
            </Link>
          </Button>
        }
      />
      <LessonLibrary
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
