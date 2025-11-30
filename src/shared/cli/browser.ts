export type AutomationBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AutomationElementDescriptor = {
  handle: string;
  tag: string;
  text?: string;
  name?: string;
  role?: string;
  attributes: Record<string, string>;
  actions: string[];
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

export type BrowserQueryResult = AutomationElementDescriptor[];

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
