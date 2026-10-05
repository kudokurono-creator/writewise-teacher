import { BookOpen, FileText, Globe2 } from "lucide-react";
import type { ClassroomAnswer } from "@/types/lesson";
import { groupClassroomSources } from "@/lib/classroom-sources";
import { teacherLanguage } from "@/lib/teacher-language";

export function ClassroomAnswerDetails({
  answer,
}: {
  answer: ClassroomAnswer;
}) {
  const documents = groupClassroomSources(answer.knowledgeSources);
  return (
    <div className="answer-details">
      {answer.teachingSuggestion?.trim() ? (
        <div>
          <h3>教学建议</h3>
          <p>{teacherLanguage(answer.teachingSuggestion)}</p>
        </div>
      ) : null}
      {answer.examples?.length ? (
        <div>
          <h3>写作示例</h3>
          {answer.examples.map((example, i) => (
            <p className="answer-example" key={i}>
              {teacherLanguage(example)}
            </p>
          ))}
        </div>
      ) : null}
      {documents.length ? (
        <div className="source-section">
          <h3>
            <BookOpen size={15} />
            参考资料
          </h3>
          {documents.map((document) => (
            <div className="source-item" key={document.documentId}>
              <div className="source-document-title">
                <FileText size={16} aria-hidden="true" />
                <span>{document.documentName}</span>
              </div>
              <p className="source-count">
                命中 {document.quotations.length} 个相关片段
              </p>
              <div className="source-actions">
                <details className="source-quotations">
                  <summary>查看引用</summary>
                  <ol>
                    {document.quotations.map((quotation, i) => (
                      <li key={i}>
                        <strong>片段 {i + 1}</strong>
                        <p>{quotation}</p>
                      </li>
                    ))}
                  </ol>
                </details>
                <a
                  href={`/api/documents/${encodeURIComponent(document.documentId)}?view=text`}
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看原文
                </a>
                <a
                  href={`/api/documents/${encodeURIComponent(document.documentId)}`}
                  className="text-link"
                >
                  下载文件
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {answer.webSources.length || answer.searchNotice ? (
        <div className="source-section">
          <h3>
            <Globe2 size={15} />
            网络来源
          </h3>
          {answer.searchNotice ? (
            <p className="muted">{answer.searchNotice}</p>
          ) : null}
          {answer.webSources.map((source) => (
            <a
              className="web-source-link"
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              {source.title}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
