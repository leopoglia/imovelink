import React from "react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Imovelink — página inicial">
      <span className="brand-mark">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M8 20 16 12 24 20" />
        </svg>
      </span>
      <span>imovelink</span>
    </Link>
  );
}
