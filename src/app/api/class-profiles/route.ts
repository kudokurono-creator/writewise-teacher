import { z } from "zod";
import { NextResponse } from "next/server";
import { db, json } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, AppError } from "@/lib/errors";
import { classProfileSchema } from "@/types/lesson";
import { referenceDocuments } from "@/services/documents/service";
import { draftClassProfile } from "@/services/ai/class-profile";

export const GET = api(async () => {
  const user = await requireUser();
  return NextResponse.json(
    await db.classProfile.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    }),
  );
});
export const POST = api(async (request) => {
  const user = await requireUser();
  const body = await request.json();
  if (body.action === "analyze") {
    const ids = z.array(z.string()).min(1).max(15).parse(body.documentIds);
    return NextResponse.json(await draftClassProfile(user.id, ids));
  }
  const { profile, id } = z
    .object({ profile: classProfileSchema, id: z.string().optional() })
    .parse(body);
  await referenceDocuments(profile.documentIds, user.id);
  if (
    id &&
    !(await db.classProfile.findFirst({ where: { id, userId: user.id } }))
  )
    throw new AppError("班级档案不存在。", 404);
  const record = id
    ? await db.classProfile.update({
        where: { id },
        data: { name: profile.className, profile: json(profile) },
      })
    : await db.classProfile.create({
        data: {
          userId: user.id,
          name: profile.className,
          profile: json(profile),
        },
      });
  return NextResponse.json({
    id: record.id,
    profile: classProfileSchema.parse(record.profile),
  });
});
