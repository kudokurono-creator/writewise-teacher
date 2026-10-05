"use client";
import {
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";
export function Field({
  label,
  children,
  hint,
  required,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  const labelId = useId();
  const hintId = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          "aria-labelledby"?: string;
          "aria-describedby"?: string;
        }>,
        {
          "aria-labelledby": labelId,
          ...(hint ? { "aria-describedby": hintId } : {}),
        },
      )
    : children;
  return (
    <label className={`field ${className}`}>
      <span id={labelId}>
        {label}
        {required ? (
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </span>
      {control}
      {hint ? (
        <small id={hintId} className="muted">
          {hint}
        </small>
      ) : null}
    </label>
  );
}
