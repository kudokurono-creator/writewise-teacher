import { extname } from "node:path";
import { AppError } from "@/lib/errors";
export type ParsedDocument = {
  text: string;
  metadata: Record<string, string | number>;
};
export interface DocumentParser {
  parse(file: Buffer): Promise<ParsedDocument>;
}
export function validateFile(name: string, bytes: Buffer) {
  const type = extname(name).slice(1).toLowerCase();
  if (!["pdf", "docx", "txt", "md"].includes(type))
    throw new AppError("仅支持 PDF、DOCX、TXT 和 Markdown 文件。");
  const max = Math.min(Number(process.env.MAX_UPLOAD_MB || 15), 15) * 1048576;
  if (bytes.length === 0 || bytes.length > max)
    throw new AppError(`文件不能为空且不能超过 ${max / 1048576} MB。`);
  if (type === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new AppError("文件内容不是有效 PDF。");
  if (type === "docx" && !bytes.subarray(0, 2).equals(Buffer.from("PK")))
    throw new AppError("文件内容不是有效 DOCX。");
  return type;
}
export function cleanText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
class TextParser implements DocumentParser {
  async parse(buffer: Buffer) {
    let text: string;
    if (buffer[0] === 0xff && buffer[1] === 0xfe)
      text = buffer.subarray(2).toString("utf16le");
    else {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder("gb18030").decode(buffer);
      }
    }
    return {
      text: cleanText(text.replace(/^\uFEFF/, "")),
      metadata: { encoding: "auto" },
    };
  }
}
class DocxParser implements DocumentParser {
  async parse(buffer: Buffer) {
    const { extractRawText } = await import("mammoth");
    const result = await extractRawText({ buffer });
    return { text: cleanText(result.value), metadata: { parser: "mammoth" } };
  }
}
class PdfParser implements DocumentParser {
  async parse(buffer: Buffer) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return {
        text: cleanText(result.text),
        metadata: { pages: result.total, parser: "pdf-parse" },
      };
    } finally {
      await parser.destroy();
    }
  }
}
export async function parseDocument(buffer: Buffer, type: string) {
  const parser =
    type === "pdf"
      ? new PdfParser()
      : type === "docx"
        ? new DocxParser()
        : new TextParser();
  const result = await parser.parse(buffer);
  if (!result.text || result.text.length < 5)
    throw new AppError("未能提取可用文本。扫描版 PDF 请先进行 OCR 后再上传。");
  if (result.text.length > 500000)
    throw new AppError("文档文本过长，请拆分后上传（最多 50 万字符）。");
  return result;
}
