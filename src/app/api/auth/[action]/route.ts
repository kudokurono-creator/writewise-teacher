import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { api, AppError } from "@/lib/errors";
import {
  createSession,
  hashPassword,
  verifyPassword,
  logout,
  throttleAuth,
} from "@/lib/auth";
const credentials = z.object({
  email: z
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(8, "密码至少 8 位").max(128),
  name: z.string().trim().min(1).max(60).optional(),
});
export const POST = (
  request: Request,
  context: { params: Promise<{ action: string }> },
) =>
  api(async (req) => {
    const { action } = await context.params;
    if (action === "logout") {
      await logout();
      return NextResponse.json({ ok: true });
    }
    if (action === "demo") {
      if (
        process.env.ALLOW_DEMO_LOGIN !== "true" ||
        process.env.NODE_ENV === "production"
      )
        throw new AppError("演示入口已关闭。", 403);
      const user = await db.user.findUnique({
        where: { email: "demo@writewise.local" },
      });
      if (!user) throw new AppError("请先运行开发数据初始化。", 503);
      await createSession(user.id);
      return NextResponse.json({ ok: true });
    }
    if (!["login", "register"].includes(action))
      throw new AppError("接口不存在。", 404);
    const data = credentials.parse(await req.json());
    await throttleAuth(req, data.email);
    if (action === "register") {
      if (!data.name) throw new AppError("请输入教师姓名。");
      if (await db.user.findUnique({ where: { email: data.email } }))
        throw new AppError("该邮箱已注册，请直接登录。");
      const user = await db.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: hashPassword(data.password),
        },
      });
      await createSession(user.id);
    } else {
      const user = await db.user.findUnique({ where: { email: data.email } });
      if (
        !verifyPassword(
          data.password,
          user?.passwordHash || hashPassword("dummy-password"),
        ) ||
        !user
      )
        throw new AppError("邮箱或密码不正确。", 401);
      await createSession(user.id);
    }
    return NextResponse.json({ ok: true });
  })(request);
