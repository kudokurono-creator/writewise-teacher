import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const dateLabel = (date: string | Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export const fullDate = (date: string | Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
export const fileSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
export async function request<T>(
  url: string,
  data?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      data instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      data instanceof FormData
        ? data
        : data === undefined
          ? undefined
          : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "操作未完成，请重试。");
  return result as T;
}
