"use client";

import * as React from "react";
import { diffLines } from "diff";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}

export function DiffViewer({ oldText, newText, oldLabel, newLabel }: DiffViewerProps) {
  const changes = React.useMemo(
    () => diffLines(oldText, newText),
    [oldText, newText]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Labels */}
      <div className="flex gap-4 text-xs font-medium">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-red-500/20 border border-red-500/40" />
          {oldLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-green-500/20 border border-green-500/40" />
          {newLabel}
        </span>
      </div>

      <ScrollArea className="h-[400px] rounded-lg border bg-muted/30">
        <div className="p-2 font-mono text-xs">
          {changes.map((part, index) => {
            const lines = part.value.split("\n");
            // Remove trailing empty string from split
            const trimmedLines = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;

            return (
              <React.Fragment key={index}>
                {trimmedLines.map((line, lineIndex) => (
                  <div
                    key={`${index}-${lineIndex}`}
                    className={cn(
                      "flex min-h-[1.5rem] items-start whitespace-pre-wrap break-all px-2 py-0.5",
                      part.added && "bg-green-500/10 text-green-700 dark:text-green-400",
                      part.removed && "bg-red-500/10 text-red-700 dark:text-red-400",
                      !part.added && !part.removed && "text-foreground"
                    )}
                  >
                    <span className="mr-2 w-4 shrink-0 select-none text-muted-foreground">
                      {part.added ? "+" : part.removed ? "-" : " "}
                    </span>
                    <span>{line}</span>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
          {changes.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              No differences found.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
