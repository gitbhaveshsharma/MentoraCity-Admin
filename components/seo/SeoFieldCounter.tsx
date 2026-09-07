"use client";

export function SeoFieldCounter({
  value,
  min,
  max,
}: {
  value?: string;
  min: number;
  max: number;
}) {
  const count = value?.length ?? 0;
  return (
    <span className={"counter " + (count < min || count > max ? "invalid" : "")}>
      {count} / {max}
    </span>
  );
}
