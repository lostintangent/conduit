import { InputGroupButton } from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserSettings } from "@/hooks/useUserSettings";
import { cn } from "@/utils/index";
import type { BrowserPage } from "@shared/types";
import { ChevronDown, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type StarredPagesMenuProps = {
  currentPage: BrowserPage;
  onPageSelected: (url: string) => void;
  onMenuOpened?: () => void;
};

export function StarredPagesMenu({
  currentPage,
  onPageSelected,
  onMenuOpened,
}: StarredPagesMenuProps) {
  const {
    starredPages = [],
    addStarredPage,
    removeStarredPage,
  } = useUserSettings();

  const starButtonRef = useRef<HTMLButtonElement | null>(null);

  const [showStarredList, setShowStarredList] = useState<boolean>(false);

  const hasStarredPages = starredPages.length > 0;
  const isCurrentUrlStarred = starredPages.some(
    (page) => page.url === currentPage.url,
  );

  // Close dropdown when URL changes
  useEffect(() => {
    setShowStarredList(false);
  }, [currentPage.url]);

  // Close dropdown if no starred pages
  useEffect(() => {
    if (!hasStarredPages) {
      setShowStarredList(false);
    }
  }, [hasStarredPages]);

  useEffect(() => {
    if (showStarredList && onMenuOpened) {
      onMenuOpened();
    }
  }, [showStarredList, onMenuOpened]);

  const handleToggleStar = useCallback(() => {
    if (!currentPage.url) {
      return;
    }

    if (isCurrentUrlStarred) {
      void removeStarredPage(currentPage.url);
    } else {
      const trimmedTitle = currentPage.title.trim();
      void addStarredPage({
        url: currentPage.url,
        title: trimmedTitle.length > 0 ? trimmedTitle : currentPage.url,
      });
    }

    setShowStarredList(false);
  }, [
    currentPage.url,
    currentPage.title,
    isCurrentUrlStarred,
    addStarredPage,
    removeStarredPage,
  ]);

  const handleStarredNavigation = useCallback(
    (pageUrl: string) => {
      onPageSelected(pageUrl);
      setShowStarredList(false);
    },
    [onPageSelected],
  );

  const handleStarredRemove = useCallback(
    (pageUrl: string) => {
      void removeStarredPage(pageUrl);
    },
    [removeStarredPage],
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <InputGroupButton
            ref={starButtonRef}
            type="button"
            size="icon-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleToggleStar}
            className={cn(
              "group hover:!bg-transparent !mr-0 !pr-0",
              isCurrentUrlStarred
                ? "text-yellow-400 hover:text-yellow-400"
                : "text-foreground/70 hover:text-yellow-400",
            )}
            aria-pressed={isCurrentUrlStarred}
            aria-label={
              isCurrentUrlStarred ? "Unstar this page" : "Star this page"
            }
          >
            <Star
              className={cn(
                "w-4 h-4 transition-all",
                isCurrentUrlStarred
                  ? "fill-yellow-400 group-hover:fill-none"
                  : "fill-none group-hover:fill-current",
              )}
            />
          </InputGroupButton>
        </TooltipTrigger>
        <TooltipContent>
          {isCurrentUrlStarred ? "Unstar page" : "Star page"}
        </TooltipContent>
      </Tooltip>
      <Popover open={showStarredList} onOpenChange={setShowStarredList}>
        <PopoverTrigger asChild>
          <InputGroupButton
            type="button"
            size="icon-xs"
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              "hover:!bg-transparent",
              !hasStarredPages
                ? "text-foreground/40 cursor-not-allowed"
                : "text-foreground/70 hover:text-foreground",
            )}
            aria-haspopup="listbox"
            aria-expanded={showStarredList}
            disabled={!hasStarredPages}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showStarredList ? "rotate-180" : ""}`}
            />
          </InputGroupButton>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-72 p-0 max-h-56 overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {starredPages.map((page) => {
            const displayTitle = page.title?.trim().length
              ? page.title
              : page.url;

            return (
              <div
                key={page.url}
                className="flex items-center border-b border-border last:border-b-0 hover:bg-accent/30 transition"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleStarredNavigation(page.url)}
                  className="flex-1 px-3 py-2 text-left transition overflow-hidden"
                  role="option"
                >
                  <span className="block text-sm truncate">{displayTitle}</span>
                  <span className="block text-xs text-foreground/50 truncate">
                    {page.url}
                  </span>
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleStarredRemove(page.url);
                  }}
                  className="group px-2 py-2 text-yellow-400 transition"
                  aria-label="Unstar this page"
                >
                  <Star className="w-4 h-4 fill-current group-hover:fill-none" />
                </button>
              </div>
            );
          })}
        </PopoverContent>
      </Popover>
    </>
  );
}
