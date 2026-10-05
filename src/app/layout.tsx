import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import "./workspace.css";
export const metadata: Metadata = {
  title: {
    default: "WriteWise · 英语写作教学助手",
    template: "%s · WriteWise",
  },
  description: "面向高中英语教师的备课、课堂助教、教学复盘与知识管理工作台。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
