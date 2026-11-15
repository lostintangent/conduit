import { Button } from "@/ui/button";
import type { LoadFailure } from "@features/browser/client/webview";
import type { ReactNode, Ref } from "react";

/** The page's host, or its whole address when it has none, like a file */
function placeOf(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** What to tell the user, by Chromium's net error code */
function describe({ code, url }: LoadFailure): [string, ReactNode] {
  // A host moves to its own line before it splits across two
  const place = <span className="inline-block">{placeOf(url)}</span>;
  switch (code) {
    case -105:
      return ["Can't Find the Server", <>Conduit can't find {place}.</>];
    case -102:
    case -109:
      return [
        "Can't Connect to the Server",
        <>Conduit can't connect to {place}.</>,
      ];
    case -106:
      return [
        "You're Not Connected to the Internet",
        <>
          Conduit can't open {place} because your Mac isn't connected to the
          internet.
        </>,
      ];
    case -118:
      return [
        "The Server Took Too Long to Respond",
        <>Conduit waited too long for {place} to respond.</>,
      ];
    default:
      return ["Can't Open This Page", <>Conduit can't open {place}.</>];
  }
}

/** What a pane shows in place of a page that didn't load, like Safari */
export function ErrorPage({
  failure,
  onTryAgain,
  ref,
}: {
  failure: LoadFailure;
  onTryAgain: () => void;
  /** Takes the keys in the page's place */
  ref?: Ref<HTMLDivElement>;
}) {
  const [headline, message] = describe(failure);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="absolute inset-0 flex flex-col items-center bg-background px-6 text-center outline-none"
    >
      {/* Puts the message a little above the middle, where the eye expects it */}
      <div className="flex-2" />
      <div className="flex max-w-90 flex-col items-center">
        <h2 className="text-base font-semibold">{headline}</h2>
        <p className="mt-1 text-sm text-muted-foreground wrap-break-word">
          {message}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-5"
          onClick={onTryAgain}
        >
          Try Again
        </Button>
        <p className="mt-5 text-xs font-mono text-muted-foreground/70">
          {failure.name}
        </p>
      </div>
      <div className="flex-3" />
    </div>
  );
}
