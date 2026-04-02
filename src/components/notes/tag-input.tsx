"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useApiHeaders, apiFetch } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ tags, onChange, placeholder = "Add tag..." }: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Fetch autocomplete suggestions
  React.useEffect(() => {
    if (!inputValue.trim() || !activeOrgId) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const data = await apiFetch(
          `/api/notes/tags?q=${encodeURIComponent(inputValue.trim())}`,
          { headers, signal: controller.signal }
        );
        const filtered = (data.tags as string[]).filter((t) => !tags.includes(t));
        setSuggestions(filtered);
        setOpen(filtered.length > 0);
      } catch {
        // ignore aborted fetches or errors
      }
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [inputValue, activeOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase().replace(/,+$/, "");
    if (!trimmed || tags.includes(trimmed)) {
      setInputValue("");
      setOpen(false);
      return;
    }
    onChange([...tags, trimmed]);
    setInputValue("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <div className="w-full">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full"
              />
            </div>
          }
        />
        <PopoverContent
          className="w-64 p-0"
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <Command>
            <CommandList>
              {suggestions.length === 0 ? (
                <CommandEmpty>No suggestions found.</CommandEmpty>
              ) : (
                <CommandGroup heading="Suggestions">
                  {suggestions.map((tag) => (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => addTag(tag)}
                    >
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add a tag.
      </p>
    </div>
  );
}
