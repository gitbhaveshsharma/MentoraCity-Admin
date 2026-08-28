"use client";

import * as React from "react";

const cn = (...classes: Array<string | undefined>) => classes.filter(Boolean).join(" ");

export const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} role="alert" className={cn("alert", className)} {...props} />);
Alert.displayName = "Alert";

export const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 className={cn("alert-title", className)} {...props} />;
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <div className={cn("alert-description", className)} {...props} />;
AlertDescription.displayName = "AlertDescription";