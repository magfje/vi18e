import React, { useState } from "react";
import { Badge } from "./badge";

interface CopyableBadgeProps {
  value: string;
  children?: React.ReactNode;
}

export function CopyableBadge({ value, children }: CopyableBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
  };

  const handleAnimationEnd = () => setCopied(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopy();
    }
  };

  const display = children ?? value;

  return (
    <Badge
      variant="outline"
      className="relative overflow-hidden text-xs cursor-pointer select-none transition-colors"
      role="button"
      tabIndex={0}
      title="Click to copy"
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
    >
      <span className={copied ? "invisible" : undefined}>{display}</span>
      {copied && (
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-background text-emerald-600 dark:text-emerald-400 animate-copied-feedback"
          onAnimationEnd={handleAnimationEnd}
        >
          Copied!
        </span>
      )}
    </Badge>
  );
}
