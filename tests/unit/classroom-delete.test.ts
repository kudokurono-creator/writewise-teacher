import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({
  db: { chatSession: { deleteMany: mocks.deleteMany } },
}));
import { DELETE } from "@/app/api/classroom/[id]/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-a" });
  mocks.deleteMany.mockResolvedValue({ count: 1 });
});
const request = (origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/classroom/chat-a", {
    method: "DELETE",
    headers: { origin },
  });
const context = { params: Promise.resolve({ id: "chat-a" }) };

describe("classroom history deletion", () => {
  it("scopes the atomic delete to the authenticated owner", async () => {
    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "chat-a", userId: "teacher-a" },
    });
  });
  it("does not delete anything without authentication", async () => {
    mocks.requireUser.mockRejectedValue(new AppError("请先登录。", 401));
    expect((await DELETE(request(), context)).status).toBe(401);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it("returns the same not-found response for unavailable and foreign conversations", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "对话不存在或已删除。" });
  });
  it("blocks cross-site mutations before touching authentication or stored messages", async () => {
    expect(
      (await DELETE(request("https://untrusted.test"), context)).status,
    ).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
