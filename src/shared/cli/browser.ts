export type AutomationBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserElementDescriptor = {
  handle: string;
  tag: string;
  text?: string;
  name?: string;
  role?: string;
  attributes: Record<string, string>;
  boundingBox: AutomationBoundingBox;
  selector?: string;
  visible: boolean;
};

export type BrowserQueryArgs = {
  paneId?: string;
  selector?: string;
  contextHandle?: string;
  text?: string;
  role?: string;
  maxResults?: number;
  timeout?: number;
  dumpTree?: boolean;
};

export type BrowserClickArgs = {
  handle: string;
  paneId?: string;
  button?: "left" | "middle" | "right";
  clicks?: number;
  offset?: { x?: number; y?: number };
};

export type BrowserHoverArgs = {
  handle: string;
  paneId?: string;
  offset?: { x?: number; y?: number };
};

export type BrowserFocusArgs = {
  handle: string;
  paneId?: string;
  scroll?: boolean;
};

export type BrowserTypeArgs = {
  handle: string;
  text: string;
  paneId?: string;
  submit?: boolean;
  delay?: number;
  replace?: boolean;
};

export type BrowserKeysArgs = {
  keys: string[];
  paneId?: string;
};

export type BrowserScrollArgs = {
  paneId?: string;
  handle?: string;
  x?: number;
  y?: number;
  direction?: "up" | "down" | "left" | "right";
  smooth?: boolean;
};

export type BrowserWaitArgs = {
  paneId?: string;
  state?: "domcontentloaded" | "networkidle";
  selector?: string;
  timeout?: number;
};

export type BrowserCaptureArgs = {
  paneId?: string;
};

export type BrowserAutomationAction =
  | "query"
  | "click"
  | "hover"
  | "focus"
  | "type"
  | "keys"
  | "scroll"
  | "waitFor";

/**
 * Command-to-args-to-result mapping for browser automation.
 * Shared between renderer and preload webview.
 */
export type BrowserAutomationCommand =
  | {
      command: "query";
      args: BrowserQueryArgs;
      result: BrowserElementDescriptor[];
    }
  | {
      command: "click";
      args: BrowserClickArgs;
      result: BrowserElementDescriptor;
    }
  | {
      command: "hover";
      args: BrowserHoverArgs;
      result: BrowserElementDescriptor;
    }
  | {
      command: "focus";
      args: BrowserFocusArgs;
      result: BrowserElementDescriptor;
    }
  | {
      command: "type";
      args: BrowserTypeArgs;
      result: BrowserElementDescriptor;
    }
  | { command: "keys"; args: BrowserKeysArgs; result: boolean }
  | { command: "scroll"; args: BrowserScrollArgs; result: boolean }
  | { command: "waitFor"; args: BrowserWaitArgs; result: boolean };

/**
 * Utility type to extract args for a specific browser automation command.
 */
export type BrowserAutomationArgs<
  T extends BrowserAutomationCommand["command"],
> = Extract<BrowserAutomationCommand, { command: T }>;

/**
 * IPC request sent from renderer to preload webview to invoke an automation command.
 */
export type BrowserAutomationRequest<
  T extends
    BrowserAutomationCommand["command"] = BrowserAutomationCommand["command"],
> = {
  requestId: string;
  command: T;
  args: BrowserAutomationArgs<T>["args"];
};

/**
 * IPC response sent from preload webview back to renderer with the automation result.
 */
export type BrowserAutomationResponse<
  T extends
    BrowserAutomationCommand["command"] = BrowserAutomationCommand["command"],
> = {
  requestId: string;
  result?: BrowserAutomationArgs<T>["result"];
  error?: string;
};

export type BrowserAutomationOption = {
  flags: string;
  description: string;
  parser?: "int";
  choices?: string[];
  defaultValue?: string | boolean;
};

export type BrowserAutomationCommandDefinition = {
  name:
    | "browser-query"
    | "browser-click"
    | "browser-hover"
    | "browser-focus"
    | "browser-type"
    | "browser-keys"
    | "browser-scroll"
    | "browser-wait";
  alias?: string;
  description: string;
  arguments?: [string, string][];
  paneDescription: string;
  options?: BrowserAutomationOption[];
  automation: BrowserAutomationAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildArgs: (args: any[], options: any) => object;
};

export const BROWSER_AUTOMATION_COMMANDS: BrowserAutomationCommandDefinition[] =
  [
    {
      name: "browser-query",
      description: "Query for elements inside a browser pane",
      arguments: [["[selector]", "CSS selector to match"]],
      paneDescription: "The ID of the pane to query",
      options: [
        {
          flags: "-c, --context <handle>",
          description: "Parent element handle",
        },
        {
          flags: "-t, --text <text>",
          description: "Filter elements whose text includes the value",
        },
        { flags: "-r, --role <role>", description: "ARIA role to filter by" },
        {
          flags: "-m, --max-results <count>",
          description: "Maximum number of results",
          parser: "int",
        },
        {
          flags: "--timeout <ms>",
          description: "Timeout for query",
          parser: "int",
        },
        {
          flags: "--dump-tree",
          description: "Return a compact accessibility tree snapshot",
        },
      ],
      automation: "query",
      buildArgs: ([selector], options) => ({
        paneId: options.pane,
        selector,
        contextHandle: options.context,
        text: options.text,
        role: options.role,
        maxResults: options.maxResults,
        timeout: options.timeout,
        dumpTree: options.dumpTree,
      }),
    },
    {
      name: "browser-click",
      description: "Click an element in a browser pane",
      arguments: [["<handle>", "Handle of the element to click"]],
      paneDescription: "The ID of the pane to click in",
      options: [
        {
          flags: "-b, --button <button>",
          description: "Mouse button",
          choices: ["left", "middle", "right"],
          defaultValue: "left",
        },
        {
          flags: "-c, --clicks <count>",
          description: "Number of clicks",
          parser: "int",
        },
        {
          flags: "--offset-x <x>",
          description: "X offset from element top-left",
          parser: "int",
        },
        {
          flags: "--offset-y <y>",
          description: "Y offset from element top-left",
          parser: "int",
        },
      ],
      automation: "click",
      buildArgs: ([handle], options) => ({
        paneId: options.pane,
        handle,
        button: options.button ?? "left",
        clicks: options.clicks ?? 1,
        offset: {
          x: options.offsetX,
          y: options.offsetY,
        },
      }),
    },
    {
      name: "browser-hover",
      description: "Hover over an element in a browser pane",
      arguments: [["<handle>", "Handle of the element to hover"]],
      paneDescription: "The ID of the pane to hover in",
      options: [
        {
          flags: "--offset-x <x>",
          description: "X offset from element top-left",
          parser: "int",
        },
        {
          flags: "--offset-y <y>",
          description: "Y offset from element top-left",
          parser: "int",
        },
      ],
      automation: "hover",
      buildArgs: ([handle], options) => ({
        paneId: options.pane,
        handle,
        offset: {
          x: options.offsetX,
          y: options.offsetY,
        },
      }),
    },
    {
      name: "browser-focus",
      description: "Focus an element in a browser pane",
      arguments: [["<handle>", "Handle of the element to focus"]],
      paneDescription: "The ID of the pane to focus in",
      options: [
        {
          flags: "--no-scroll",
          description: "Do not scroll the element into view before focusing",
        },
      ],
      automation: "focus",
      buildArgs: ([handle], options) => ({
        paneId: options.pane,
        handle,
        scroll: options.scroll,
      }),
    },
    {
      name: "browser-type",
      description: "Type text into an element",
      arguments: [
        ["<handle>", "Handle of the element to type into"],
        ["<text>", "Text to type"],
      ],
      paneDescription: "The ID of the pane to type in",
      options: [
        {
          flags: "-s, --submit",
          description: "Submit with Enter after typing",
        },
        {
          flags: "-d, --delay <ms>",
          description: "Delay between keystrokes",
          parser: "int",
        },
        {
          flags: "-r, --replace",
          description: "Replace existing value instead of appending",
        },
      ],
      automation: "type",
      buildArgs: ([handle, text], options) => ({
        paneId: options.pane,
        handle,
        text,
        submit: options.submit,
        delay: options.delay,
        replace: options.replace,
      }),
    },
    {
      name: "browser-keys",
      description: "Send raw key presses to the active element",
      arguments: [["<keys...>", "Keys or chords to send (e.g. Enter, Meta+R)"]],
      paneDescription: "The ID of the pane to send keys to",
      automation: "keys",
      buildArgs: ([keys], options) => ({
        paneId: options.pane,
        keys,
      }),
    },
    {
      name: "browser-scroll",
      description: "Scroll the page or a specific element",
      arguments: [["[handle]", "Handle of the element to scroll"]],
      paneDescription: "The ID of the pane to scroll",
      options: [
        {
          flags: "-x, --x <pixels>",
          description: "Horizontal scroll delta",
          parser: "int",
        },
        {
          flags: "-y, --y <pixels>",
          description: "Vertical scroll delta",
          parser: "int",
        },
        {
          flags: "-d, --direction <direction>",
          description: "Direction to scroll",
          choices: ["up", "down", "left", "right"],
        },
        {
          flags: "-s, --smooth",
          description: "Use smooth scrolling where supported",
        },
      ],
      automation: "scroll",
      buildArgs: ([handle], options) => ({
        paneId: options.pane,
        handle,
        x: options.x,
        y: options.y,
        direction: options.direction,
        smooth: options.smooth,
      }),
    },
    {
      name: "browser-wait",
      description: "Wait for a selector or page state",
      arguments: [["[selector]", "Optional selector to wait for"]],
      paneDescription: "The ID of the pane to wait on",
      options: [
        {
          flags: "-s, --state <state>",
          description: "Load state to wait for",
          choices: ["domcontentloaded", "networkidle"],
        },
        {
          flags: "--timeout <ms>",
          description: "Timeout before failing",
          parser: "int",
        },
      ],
      automation: "waitFor",
      buildArgs: ([selector], options) => ({
        paneId: options.pane,
        selector,
        state: options.state,
        timeout: options.timeout,
      }),
    },
  ];
