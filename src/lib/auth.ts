import { cookies } from "next/headers";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { AppError } from "./errors";
const COOKIE = "writewise_session";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || hash.length !== 128) return false;
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  );
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({ data: { id: digest(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}
export const getUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
});
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new AppError("请先登录。", 401);
  return user;
}
export async function pageUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  jar.delete(COOKIE);
}
export async function throttleAuth(request: Request, email: string) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const keys = [digest(`ip:${ip}`), digest(`email:${email}`)];
  const since = new Date(Date.now() - 15 * 60000);
  const count = await db.authAttempt.count({
    where: { key: { in: keys }, createdAt: { gt: since } },
  });
  if (count >= 20)
    throw new AppError("登录尝试过于频繁，请 15 分钟后重试。", 429);
  await db.authAttempt.createMany({ data: keys.map((key) => ({ key })) });
  await db.authAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 86400000) } },
  });
}
