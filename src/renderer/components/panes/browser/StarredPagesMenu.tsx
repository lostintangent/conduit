import { useUserSettings } from "@/hooks/useUserSettings";
import { StarredPage } from "@/shared/types";
import { ChevronDown, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type StarredPagesMenuProps = {
  currentPage: StarredPage;
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
  const starMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const starredDropdownRef = useRef<HTMLDivElement | null>(null);

  const [showStarredList, setShowStarredList] = useState<boolean>(false);

  const hasStarredPages = starredPages.length > 0;
  const isCurrentUrlStarred = starredPages.some(
    (page) => page.url === currentPage.url,
  );

  useEffect(() => {
    if (!showStarredList) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        starButtonRef.current?.contains(target) ||
        starMenuButtonRef.current?.contains(target) ||
        starredDropdownRef.current?.contains(target)
      ) {
        return;
      }

      setShowStarredList(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStarredList]);

  useEffect(() => {
    setShowStarredList(false);
  }, [currentPage.url]);

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

  const handleStarredDropdownToggle = useCallback(() => {
    if (!hasStarredPages) {
      return;
    }

    setShowStarredList((value) => !value);
  }, [hasStarredPages]);

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
      <button
        ref={starButtonRef}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleToggleStar}
        className={`pointer-events-auto p-1 rounded transition-colors ${
          isCurrentUrlStarred
            ? "text-yellow-400 hover:text-yellow-300"
            : "text-white/70 hover:text-white"
        }`}
        aria-pressed={isCurrentUrlStarred}
        title={isCurrentUrlStarred ? "Unstar this page" : "Star this page"}
      >
        <Star
          className="w-4 h-4"
          fill={isCurrentUrlStarred ? "currentColor" : "none"}
        />
      </button>
      <button
        ref={starMenuButtonRef}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleStarredDropdownToggle}
        className={`pointer-events-auto p-1 rounded transition-colors ${
          !hasStarredPages
            ? "text-white/40 cursor-not-allowed"
            : "text-white/70 hover:text-white"
        }`}
        title="Show starred pages"
        aria-haspopup="listbox"
        aria-expanded={showStarredList}
        disabled={!hasStarredPages}
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      {showStarredList && hasStarredPages && (
        <div
          ref={starredDropdownRef}
          className="absolute top-full right-0 mt-1 w-72 bg-surface border border-white/10 rounded shadow-lg z-20 max-h-56 overflow-y-auto"
          role="listbox"
        >
          {starredPages.map((page) => {
            const displayTitle = page.title?.trim().length
              ? page.title
              : page.url;
            return (
              <div
                key={page.url}
                className="group flex items-center border-b border-white/5 last:border-b-0 hover:bg-white/10 transition"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleStarredNavigation(page.url)}
                  className="flex-1 px-3 py-2 text-left text-white transition overflow-hidden"
                  role="option"
                >
                  <span className="block text-sm truncate">{displayTitle}</span>
                  <span className="block text-xs text-white/50 truncate">
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
                  className="px-2 py-2 text-yellow-400 hover:text-yellow-300 transition"
                  aria-label="Unstar this page"
                >
                  <Star className="w-4 h-4" fill="currentColor" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
