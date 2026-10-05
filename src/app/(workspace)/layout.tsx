import { pageUser } from "@/lib/auth";
import { isAIConfigured, isMockAI } from "@/services/ai/provider";
import { Shell } from "@/components/shell";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await pageUser();
  return (
    <Shell user={user} mock={isMockAI()} aiConfigured={isAIConfigured()}>
      {children}
    </Shell>
  );
}
