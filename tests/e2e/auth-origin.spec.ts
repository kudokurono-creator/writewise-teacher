import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
const email = `auth-loopback-${Date.now()}@teacher.test`;
test.afterAll(async () => {
  const db = new PrismaClient();
  try {
    await db.user.deleteMany({ where: { email } });
  } finally {
    await db.$disconnect();
  }
});
test("registers and logs in through 127.0.0.1 when APP_URL uses localhost", async ({
  page,
  baseURL,
}) => {
  const url = new URL(baseURL!);
  url.hostname = "127.0.0.1";
  await page.goto(`${url.origin}/register`);
  await page.getByLabel("教师姓名").fill("验收本机地址");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  const registered = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/register") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  expect((await registered).status()).toBe(200);
  await expect(page).toHaveURL(`${url.origin}/dashboard`);
  expect(
    (
      await page.request.post(`${url.origin}/api/auth/logout`, {
        data: {},
        headers: { origin: url.origin },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`${url.origin}/login`);
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  const loggedIn = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登录教学空间", exact: true }).click();
  expect((await loggedIn).status()).toBe(200);
  await expect(page).toHaveURL(`${url.origin}/dashboard`);
  const external = await page.request.post(`${url.origin}/api/auth/register`, {
    headers: { origin: "https://untrusted.test" },
    data: { email, password: "Teacher2026!", name: "External" },
  });
  expect(external.status()).toBe(403);
});
