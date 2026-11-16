import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { ApplicationCommands } from "@shared/commands";
import type { FoundInPageEvent, WebviewTag } from "electron";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** How long typing pauses before the page is searched */
const SEARCH_DELAY_MS = 100;
const WIDTH = 300;

export type FindBarHandle = {
  /** Opens the bar, or focuses it, with its text selected to type over */
  open: () => void;
  /** Goes to the next match, or the previous one, opening the bar if closed */
  step: (forward: boolean) => void;
};

type FindBarProps = {
  ref?: Ref<FindBarHandle>;
  page: RefObject<WebviewTag | null>;
  /** Draws it over the page, which only the pane knows how to do */
  zIndex: number;
  /** Moves it with the page every frame, like while the sidebar slides */
  follow: boolean;
  hidden?: boolean;
  /** Focus went to the bar, which the pane's own DOM doesn't have */
  onFocus: (field: HTMLInputElement) => void;
  /** Gives the page focus as the bar closes */
  onFocusPage: () => void;
};

/** What the page's latest search found */
type Found = { active: number; matches: number };

/** The search that counts, which nothing does while there's none */
const NO_SEARCH = { id: Number.POSITIVE_INFINITY, text: "" };

/**
 * Finds text in a page, from a card floating at the top right of it. It
 * floats so the page keeps its size, and the matches don't move as the user
 * steps through them.
 */
export function FindBar({
  ref,
  page,
  zIndex,
  follow,
  hidden = false,
  onFocus,
  onFocusPage,
}: FindBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [found, setFound] = useState<Found>();
  // Each request focuses the field and selects its text
  const [selectRequest, setSelectRequest] = useState(0);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  // The page numbers each request, and steps from a search number theirs after
  // it, so anything numbered before it is for older text
  const searchRef = useRef(NO_SEARCH);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Searches the page anew, or steps on when `again` and the text is the same */
  const search = (text: string, { forward = true, again = false } = {}) => {
    clearTimeout(searchTimerRef.current);
    const webview = page.current;
    if (!webview) return;
    if (!text) {
      webview.stopFindInPage("clearSelection");
      searchRef.current = NO_SEARCH;
      setFound(undefined);
      return;
    }
    const isNew = !again || text !== searchRef.current.text;
    const id = webview.findInPage(text, { forward, findNext: isNew });
    if (isNew) searchRef.current = { id, text };
  };

  // A new search starts past the match the page kept selected, so the page
  // stays where it is until the user goes on. The bar's focus scope focuses
  // the field as it opens, see below.
  const open = () => {
    if (isOpen) setSelectRequest((request) => request + 1);
    else setIsOpen(true);
  };

  // While it's closed, from where the user is in the page, like Safari's
  const step = (forward: boolean) => {
    if (!isOpen) open();
    if (text) search(text, { forward, again: true });
  };

  const close = (focusPage: boolean) => {
    clearTimeout(searchTimerRef.current);
    // Like Safari, the match stays selected, to copy
    page.current?.stopFindInPage("keepSelection");
    searchRef.current = NO_SEARCH;
    setFound(undefined);
    setIsOpen(false);
    if (focusPage) onFocusPage();
  };

  useImperativeHandle(ref, () => ({ open, step }));

  useLayoutEffect(() => {
    if (!selectRequest) return;
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [selectRequest]);

  const handleFound = useEffectEvent(({ result }: FoundInPageEvent) => {
    if (result.requestId < searchRef.current.id) return;
    setFound({ active: result.activeMatchOrdinal, matches: result.matches });
  });

  // A new page has nothing found yet
  const handleNavigate = useEffectEvent(() => {
    close(!!barRef.current?.contains(document.activeElement));
  });

  useEffect(() => {
    const webview = page.current;
    if (!isOpen || !webview) return;
    webview.addEventListener("found-in-page", handleFound);
    webview.addEventListener("did-navigate", handleNavigate);
    return () => {
      webview.removeEventListener("found-in-page", handleFound);
      webview.removeEventListener("did-navigate", handleNavigate);
    };
  }, [isOpen, page]);

  const isShown = isOpen && !hidden;

  // The page lives on the body, outside the pane, so the bar does too, and
  // stays where the pane marks out
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const bar = barRef.current;
    if (!isShown || !anchor || !bar) return;

    const place = () => {
      const { top, right, width } = anchor.getBoundingClientRect();
      bar.style.top = `${top}px`;
      bar.style.right = `${document.documentElement.clientWidth - right}px`;
      bar.style.width = `${Math.min(WIDTH, width)}px`;
    };

    if (follow) {
      let frame = 0;
      const placeEachFrame = () => {
        place();
        frame = requestAnimationFrame(placeEachFrame);
      };
      placeEachFrame();
      return () => cancelAnimationFrame(frame);
    }

    place();
    const resizeObserver = new ResizeObserver(place);
    resizeObserver.observe(anchor);
    window.addEventListener("resize", place);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [isShown, follow]);

  const findNext = useCommand(ApplicationCommands.BROWSER_FIND_NEXT);
  const findPrevious = useCommand(ApplicationCommands.BROWSER_FIND_PREVIOUS);

  if (!isOpen) return null;

  const count =
    !text || !found
      ? ""
      : found.matches
        ? `${found.active} of ${found.matches}`
        : "Not found";

  return (
    <>
      <div
        ref={anchorRef}
        className="pointer-events-none absolute inset-2"
        aria-hidden
      />
      {createPortal(
        // A layer over the page, like a Radix popover, which a quick pane's
        // dialog would otherwise take as outside it. It takes pointer events,
        // which the dialog turns off for the body, and its scope pauses the
        // dialog's focus trap before focusing the field. It stays while it's
        // hidden, so that's only as it opens.
        <FocusScope
          asChild
          onUnmountAutoFocus={(event) => event.preventDefault()}
        >
          <div
            ref={barRef}
            role="search"
            hidden={!isShown}
            className="pointer-events-auto fixed animate-in fade-in-0 duration-120 motion-safe:slide-in-from-top-1"
            style={{ zIndex }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              close(true);
            }}
          >
            <InputGroup className="h-8 rounded-lg border-border bg-popover text-popover-foreground shadow-md dark:bg-popover">
              <InputGroupInput
                ref={fieldRef}
                value={text}
                placeholder="Find in page"
                aria-label="Find in page"
                className="text-sm"
                onFocus={(event) => onFocus(event.currentTarget)}
                onChange={(event) => {
                  const text = event.target.value;
                  setText(text);
                  clearTimeout(searchTimerRef.current);
                  searchTimerRef.current = setTimeout(
                    () => search(text),
                    SEARCH_DELAY_MS,
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  step(!event.shiftKey);
                }}
              />
              <InputGroupAddon align="inline-end" className="gap-0.5">
                <span
                  role="status"
                  className="px-1 text-xs tabular-nums whitespace-nowrap"
                >
                  {count}
                </span>
                <FindButton
                  label={getCommandDisplayTitle({
                    title: "Previous",
                    primaryKeybinding: findPrevious.primaryKeybinding,
                  })}
                  name="Previous"
                  onClick={() => step(false)}
                >
                  <ChevronUp className="size-3.5" />
                </FindButton>
                <FindButton
                  label={getCommandDisplayTitle({
                    title: "Next",
                    primaryKeybinding: findNext.primaryKeybinding,
                  })}
                  name="Next"
                  onClick={() => step(true)}
                >
                  <ChevronDown className="size-3.5" />
                </FindButton>
                <FindButton
                  label="Close (Esc)"
                  name="Close"
                  onClick={() => close(true)}
                >
                  <X className="size-3.5" />
                </FindButton>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </FocusScope>,
        document.body,
      )}
    </>
  );
}

function FindButton({
  label,
  name,
  onClick,
  children,
}: {
  label: string;
  name: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InputGroupButton
          size="icon-xs"
          aria-label={name}
          // Like Safari's, so the user can go on typing
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </InputGroupButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
