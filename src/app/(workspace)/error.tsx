"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>页面暂时无法加载</h2>
      <p className="muted">请重试。如果问题持续，请检查数据库服务是否启动。</p>
      <Button onClick={reset}>重新加载</Button>
    </div>
  );
}
