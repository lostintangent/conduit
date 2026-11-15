import { InputGroupButton } from "@/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { libraryMutations, useLibrary } from "@features/browser/client/queries";
import { cn } from "@/utils/index";
import type { BrowserPage } from "@features/browser/model";
import { useMutation } from "@tanstack/react-query";
import { Star } from "lucide-react";

/** Stars or unstars the page, whose favorites the address bar suggests */
export function StarButton({ currentPage }: { currentPage: BrowserPage }) {
  const isStarred = useLibrary((library) =>
    library.favorites.some((page) => page.url === currentPage.url),
  );
  const { mutate: addFavorite } = useMutation(libraryMutations.addFavorite());
  const { mutate: removeFavorite } = useMutation(
    libraryMutations.removeFavorite(),
  );

  const handleToggleStar = () => {
    if (!currentPage.url) return;
    if (isStarred) removeFavorite(currentPage.url);
    else addFavorite(currentPage);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InputGroupButton
          type="button"
          size="icon-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggleStar}
          className={cn(
            "group hover:!bg-transparent",
            isStarred
              ? "text-yellow-400 hover:text-yellow-400"
              : "text-foreground/70 hover:text-yellow-400",
          )}
          aria-pressed={isStarred}
          aria-label={isStarred ? "Unstar this page" : "Star this page"}
        >
          <Star
            className={cn(
              "w-4 h-4 transition-all",
              isStarred
                ? "fill-yellow-400 group-hover:fill-none"
                : "fill-none group-hover:fill-current",
            )}
          />
        </InputGroupButton>
      </TooltipTrigger>
      <TooltipContent>{isStarred ? "Unstar page" : "Star page"}</TooltipContent>
    </Tooltip>
  );
}
