import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api } from "@/lib/errors";
export const POST = api(async (request) => {
  const user = await requireUser();
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      description: z.string().max(1000).default(""),
      category: z.string().max(50).default("教学资料"),
    })
    .parse(await request.json());
  return NextResponse.json(
    await db.knowledgeBase.create({ data: { ...data, userId: user.id } }),
    { status: 201 },
  );
});
export const GET = api(async () => {
  const user = await requireUser();
  return NextResponse.json(
    await db.knowledgeBase.findMany({
      where: { userId: user.id },
      include: { _count: { select: { documents: true } } },
    }),
  );
});
