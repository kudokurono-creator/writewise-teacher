import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "请求格式无效，请重新提交。" },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("；"),
      },
      { status: 400 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return NextResponse.json(
      { error: "记录已存在，请刷新后重试。" },
      { status: 409 },
    );
  console.error(
    error instanceof Error ? error.message : "Unknown server error",
  );
  return NextResponse.json(
    { error: "操作未完成，请稍后重试。若问题持续，请检查服务配置。" },
    { status: 500 },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  // Same-site cookies plus origin validation protect all authenticated mutations.
  const own = new URL(request.url).origin;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expected && origin !== own)
  )
    throw new AppError("请求来源不受信任。", 403);
}
export const api =
  (handler: (request: Request) => Promise<Response>) =>
  async (request: Request) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
      return await handler(request);
    } catch (e) {
      return errorResponse(e);
    }
  };
