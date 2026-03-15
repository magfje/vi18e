import { AlertTriangle } from "lucide-react";
import React from "react";
import type { CatalogItem } from "../../../../shared/types/catalog";
import { cn } from "../../lib/utils";
import { StatusBadge } from "./StatusBadge";

interface CatalogListItemProps {
  item: CatalogItem;
  isSelected: boolean;
  style?: React.CSSProperties;
  onClick: () => void;
}

export function CatalogListItem({
  item,
  isSelected,
  style,
  onClick,
}: CatalogListItemProps) {
  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 w-full text-left cursor-pointer border-b border-border text-sm select-none",
        isSelected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/50",
      )}
    >
      <StatusBadge
        status={item.status}
        isModified={item.isModified}
        className="mt-0.5"
      />
      {item.issue && (
        <span title={item.issue.message} className="shrink-0">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        </span>
      )}
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
        <span className="truncate text-foreground">
          {item.source || item.msgid}
        </span>
        <span
          className={cn(
            "truncate",
            item.isTranslated
              ? "text-foreground"
              : "text-muted-foreground italic",
          )}
        >
          {item.translations[0] || "—"}
        </span>
      </div>
    </button>
  );
}
