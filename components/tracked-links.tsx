"use client";

import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { ImpactCounterKey, incrementImpactCounter, trackImpactCounter } from "@/lib/impact";

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
  const router = useRouter();

  return (
    <Link
      {...props}
      className={className}
      onClick={async (event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          typeof props.href !== "string"
        ) {
          trackImpactCounter(counterKey);
          return;
        }

        event.preventDefault();
        await incrementImpactCounter(counterKey);
        if (props.replace) {
          router.replace(props.href);
          return;
        }
        router.push(props.href);
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
