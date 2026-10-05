import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>找不到这份资料</h1>
      <p>记录可能不存在，或不属于当前教学空间。</p>
      <Button asChild>
        <Link href="/dashboard">回到教学工作台</Link>
      </Button>
    </div>
  );
}
