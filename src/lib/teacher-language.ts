// Also applied to streamed text, so model mistakes do not expose field names.
export function teacherLanguage(text: string) {
  return text
    .replace(/currentCourseContext/gi, "当前课程信息")
    .replace(/knowledgeContext|retrievalContext|retrieval result/gi, "参考资料")
    .replace(/webContext|searchContext/gi, "网络检索资料")
    .replace(/conversationHistory/gi, "当前对话记录")
    .replace(/currentUserMessage/gi, "本次问题")
    .replace(/system[ _-]?prompt/gi, "回答规则")
    .replace(/tool[ _-]?call/gi, "资料查询")
    .replace(/documentChunkId|retrieval index/gi, "引用片段")
    .replace(/similarity score|vector score|rerank score/gi, "相关程度")
    .replace(/vector[ _-]?store/gi, "参考资料库")
    .replace(/embedding|rerank|\bchunk\b/gi, "资料处理")
    .replace(/\brouter\b/gi, "回答方式");
}
