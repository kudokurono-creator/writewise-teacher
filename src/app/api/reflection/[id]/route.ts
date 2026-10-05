import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { api } from "@/lib/errors";
import {
  analyzeReflection,
  optimizeFromReflection,
} from "@/services/ai/reflection";
export const POST = (r: Request, c: { params: Promise<{ id: string }> }) =>
  api(async (request) => {
    const user = await requireUser();
    const body = await request.json();
    const id = (await c.params).id;
    if (z.enum(["analyze", "optimize"]).parse(body.action) === "analyze")
      return NextResponse.json(await analyzeReflection(id, user.id));
    return NextResponse.json(
      await optimizeFromReflection(
        id,
        user.id,
        z.number().int().min(1).parse(body.expectedVersion),
      ),
    );
  })(r);
