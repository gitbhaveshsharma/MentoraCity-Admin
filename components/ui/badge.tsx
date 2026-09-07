import * as React from "react";

const cn = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(" ");

export function Badge({
  className,
  variant = "muted",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "muted" | "source" | "active" | "warning";
}) {
  const map = {
    muted: "badge badge-muted",
    source: "badge badge-source",
    active: "badge badge-active",
    warning: "badge badge-category",
  } as const;
  return <span className={cn(map[variant], className)} {...props} />;
}
