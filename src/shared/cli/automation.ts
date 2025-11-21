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
  paneId: string;
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
  paneId: string;
  handle: string;
  button?: "left" | "middle" | "right";
  clicks?: number;
  offset?: { x?: number; y?: number };
};

export type BrowserTypeArgs = {
  paneId: string;
  handle: string;
  text: string;
  submit?: boolean;
  delay?: number;
  replace?: boolean;
};

export type BrowserKeysArgs = {
  paneId: string;
  keys: string[];
};

export type BrowserScrollArgs = {
  paneId: string;
  handle?: string;
  x?: number;
  y?: number;
  direction?: "up" | "down" | "left" | "right";
  smooth?: boolean;
};

export type BrowserWaitArgs = {
  paneId: string;
  state?: "domcontentloaded" | "networkidle";
  selector?: string;
  timeout?: number;
};

export type BrowserEvaluateArgs = {
  paneId: string;
  expression: string;
  contextHandle?: string;
};

export type BrowserCaptureArgs = {
  paneId: string;
  handle?: string;
};
