class HandleRegistry {
  private handles = new Map<string, WeakRef<Element>>();
  private sequence = 0;

  register(element: Element): string {
    const handle = "h-" + Date.now() + "-" + ++this.sequence;
    this.handles.set(handle, new WeakRef(element));
    return handle;
  }

  resolve(handle: string): Element {
    const ref = this.handles.get(handle);
    const element = ref?.deref();

    if (!element || !element.isConnected) {
      this.handles.delete(handle);
      throw new Error("ERR_HANDLE_STALE");
    }

    return element;
  }

  clear() {
    this.handles.clear();
  }
}

export const handles = new HandleRegistry();
