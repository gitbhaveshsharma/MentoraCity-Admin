"use client";

import * as React from "react";

const cn = (...classes: Array<string | undefined>) => classes.filter(Boolean).join(" ");

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<"textarea">>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("textarea", className)} {...props} />);
Textarea.displayName = "Textarea";