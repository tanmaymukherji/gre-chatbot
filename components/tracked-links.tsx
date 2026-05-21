"use client";

import Link, { LinkProps } from "next/link";
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { ImpactCounterKey, trackImpactCounter } from "@/lib/impact";

type TrackedLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  counterKey?: ImpactCounterKey;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type TrackedAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  counterKey?: ImpactCounterKey;
};

export function TrackedLink({
  children,
  className,
  counterKey = "solutions_discovered",
  onClick,
  ...props
}: TrackedLinkProps) {
  return (
    <Link
      {...props}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          trackImpactCounter(counterKey);
        }
      }}
    >
      {children}
    </Link>
  );
}

export function TrackedAnchor({
  children,
  className,
  counterKey = "solutions_discovered",
  onClick,
  ...props
}: TrackedAnchorProps) {
  return (
    <a
      {...props}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          trackImpactCounter(counterKey);
        }
      }}
    >
      {children}
    </a>
  );
}
