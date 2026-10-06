import { describe, expect, it, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  defaultBasic,
  basicInfoSchema,
  lessonContentSchema,
  validateDuration,
  analysisSchema,
} from "@/types/lesson";
import { sampleAnalysis, sampleLesson } from "@/services/ai/mock";
import {
  validateFile,
  parseDocument,
  cleanText,
} from "@/services/documents/parser";
import { chunkText } from "@/services/rag/chunker";
import { MockEmbeddingProvider } from "@/services/rag/embedding";
import {
  OpenAICompatibleProvider,
  parseJSON,
} from "@/services/ai/openai-compatible";
import { exportLesson } from "@/services/export/docx";
import { LocalStorageProvider } from "@/services/storage/provider";
import { partialAnswer } from "@/lib/stream";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { checkedDesignSchema } from "@/services/ai/lesson-plan";
const info = {
  ...defaultBasic,
  title: "邀请信写作测试",
  topic: "School English festival",
};
afterEach(() => vi.unstubAllGlobals());
describe("lesson contract", () => {
  it("accepts file-first drafts with optional title, textbook metadata and topic", () => {
    expect(basicInfoSchema.safeParse(defaultBasic).success).toBe(true);
    expect(
      basicInfoSchema.safeParse({ ...defaultBasic, duration: 0 }).success,
    ).toBe(false);
    expect(
      basicInfoSchema.safeParse({
        ...defaultBasic,
        duration: 45,
        lessonDurations: [50],
      }).success,
    ).toBe(false);
  });
  it.each([20, 40, 45, 60, 90, 180])(
    "allocates exactly %i minutes",
    (duration) => {
      const lesson = sampleLesson({ ...info, duration });
      expect(
        validateDuration(
          lessonContentSchema.parse(lesson),
          duration,
        ).stages.reduce((n, s) => n + s.duration, 0),
      ).toBe(duration);
    },
  );
  it("rejects malformed stages and duplicate IDs", () => {
    const lesson = sampleLesson(info);
    expect(
      lessonContentSchema.safeParse({
        ...lesson,
        stages: [{ ...lesson.stages[0], duration: -1 }],
      }).success,
    ).toBe(false);
    const duplicate = structuredClone(lesson);
    duplicate.stages[1].id = duplicate.stages[0].id;
    expect(() => validateDuration(duplicate, 45)).toThrow("ID");
  });
  it("does not invent student data", () => {
    expect(sampleAnalysis(info).students).toContain("尚未提供");
  });
});
describe("document pipeline", () => {
  it("validates signatures and rejects unsupported types", () => {
    expect(() => validateFile("a.exe", Buffer.from("hello"))).toThrow("仅支持");
    expect(() => validateFile("fake.pdf", Buffer.from("hello"))).toThrow("PDF");
    expect(() => validateFile("fake.docx", Buffer.from("hello"))).toThrow(
      "DOCX",
    );
    expect(() => validateFile("empty.txt", Buffer.alloc(0))).toThrow(
      "不能为空",
    );
  });
  it("cleans line endings and parses UTF-8/UTF-16 text", async () => {
    expect(cleanText(" a\r\n\n\n b\u0000")).toBe("a\n\n b");
    expect(
      (await parseDocument(Buffer.from("班级写作分析\n衔接与段落组织"), "txt"))
        .text,
    ).toContain("班级写作");
    expect(
      (
        await parseDocument(
          Buffer.concat([
            Buffer.from([255, 254]),
            Buffer.from("学生写作反馈分析", "utf16le"),
          ]),
          "txt",
        )
      ).text,
    ).toContain("学生写作反馈");
  });
  it("extracts actual PDF text", async () => {
    const bytes = await readFile("tests/fixtures/student-profile.pdf");
    expect((await parseDocument(bytes, "pdf")).text).toContain(
      "Student writing profile",
    );
  });
  it("exports a valid Word package and parses it back", async () => {
    const bytes = await exportLesson(info, sampleLesson(info));
    expect(validateFile("lesson.docx", bytes)).toBe("docx");
    const parsed = await parseDocument(bytes, "docx");
    expect(parsed.text).toContain("教学过程");
    expect(parsed.text).toContain("学生活动");
    expect(parsed.text).toContain(info.title);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:tbl");
    expect(xml).toContain("w:tblHeader");
    expect(xml).toContain("楷体");
    expect(xml).toContain('w:w="9638"');
    expect(parsed.text).toContain("课堂教学设计表");
    expect(parsed.text).toContain("课程标准（学科基本要求）");
    expect(parsed.text).toContain("教学特色与反思");
    expect(xml).not.toContain("{{");
  });
  it("prevents storage path traversal", async () => {
    const storage = new LocalStorageProvider();
    await expect(storage.read("../.env")).rejects.toThrow("路径");
    await expect(
      storage.put("../escape", "txt", Buffer.from("test")),
    ).rejects.toThrow();
  });
  it("preserves template parts and safely exports literal XML and template-like text", async () => {
    const content = sampleLesson(info);
    content.stages[0].teacherActivities = "A < B & C > D\n{{REFLECTION}} $&";
    const bytes = await exportLesson(
      { ...info, title: "邀请信 <A&B>" },
      content,
      "教师<甲>",
    );
    const parsed = await parseDocument(bytes, "docx");
    expect(parsed.text).toContain("A < B & C > D");
    expect(parsed.text).toContain("{{REFLECTION}} $&");
    expect(parsed.text).toContain("教师<甲>");
    const template = await JSZip.loadAsync(
      await readFile("public/templates/classroom-design-2026.docx"),
    );
    const output = await JSZip.loadAsync(bytes);
    for (const [path, entry] of Object.entries(template.files)) {
      if (
        entry.dir ||
        ["word/document.xml", "docProps/core.xml"].includes(path)
      )
        continue;
      expect(await output.file(path)!.async("nodebuffer")).toEqual(
        await entry.async("nodebuffer"),
      );
    }
  });
});
describe("retrieval utilities", () => {
  it("keeps document coverage with bounded overlapping chunks", () => {
    const text = "Writing a clear invitation. ".repeat(140);
    const chunks = chunkText(text, 120, 20);
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.every((c) => c.length <= 121)).toBe(true);
    expect(chunks.at(-1)).toContain("invitation");
    expect(() => chunkText(text, 20, 20)).toThrow();
  });
  it("creates deterministic normalized demo vectors", async () => {
    const provider = new MockEmbeddingProvider();
    const [a, b, c] = await provider.embed([
      "写作邀请信 invitation",
      "写作邀请信 invitation",
      "课堂观察 reflection",
    ]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(Math.sqrt(a.reduce((n, v) => n + v * v, 0))).toBeCloseTo(1);
  });
});
describe("AI provider", () => {
  it("serializes transformed input schemas and derives legacy stages from new lessons", async () => {
    process.env.AI_BASE_URL = "https://model.test/v1";
    process.env.AI_API_KEY = "test-key";
    const modelContent = { ...sampleLesson(info), stages: undefined };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: JSON.stringify(modelContent) } }],
        }),
      ),
    );
    const result = await new OpenAICompatibleProvider().generateStructured(
      [{ role: "user", content: "Design the lesson" }],
      checkedDesignSchema(info, true),
    );
    expect(result.data.stages).toEqual(
      result.data.lessons!.flatMap((l) => l.stages),
    );
    expect(result.data.stages).toHaveLength(7);
  });
  it("handles fenced JSON", () =>
    expect(parseJSON('```json\n{"ok":true}\n```')).toEqual({ ok: true }));
  it("repairs invalid structured output exactly once", async () => {
    process.env.AI_BASE_URL = "https://model.test/v1";
    process.env.AI_API_KEY = "test-key";
    const valid = sampleAnalysis(info);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "bad json" } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: JSON.stringify(valid) } }],
          usage: { prompt_tokens: 30, completion_tokens: 70 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAICompatibleProvider().generateStructured(
      [{ role: "user", content: "Analyze" }],
      analysisSchema,
    );
    expect(result.data).toEqual(valid);
    expect(result.outputTokens).toBe(70);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("reports validation failure after one failed repair", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            Response.json({ choices: [{ message: { content: "{}" } }] }),
          ),
        ),
    );
    await expect(
      new OpenAICompatibleProvider().generateStructured([], analysisSchema),
    ).rejects.toThrow("修复一次");
  });
  it("reads streaming deltas across split UTF-8 boundaries", async () => {
    const encoded = new TextEncoder().encode(
      'data: {"choices":[{"delta":{"content":"教学"}}]}\n\ndata: [DONE]\n',
    );
    const body = new ReadableStream({
      start(c) {
        for (let i = 0; i < encoded.length; i += 3)
          c.enqueue(encoded.slice(i, i + 3));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    let result = "";
    for await (const part of new OpenAICompatibleProvider().streamChat([]))
      result += part;
    expect(result).toBe("教学");
  });
  it("shows only readable partial answers", () => {
    expect(partialAnswer('{"answer":"First\\nThen')).toBe("First\nThen");
    expect(partialAnswer('{"answer":"Quote: \\"Hi\\"')).toBe('Quote: "Hi"');
    expect(partialAnswer('{"teachingSuggestion":')).toBe("");
  });
});
describe("passwords", () => {
  it("uses salted hashes and rejects incorrect credentials", () => {
    const stored = hashPassword("Teacher123!");
    expect(stored).not.toEqual(hashPassword("Teacher123!"));
    expect(verifyPassword("Teacher123!", stored)).toBe(true);
    expect(verifyPassword("WrongPass", stored)).toBe(false);
    expect(verifyPassword("test", "malformed")).toBe(false);
  });
});
