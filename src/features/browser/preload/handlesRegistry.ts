interface HandleEntry {
  elementRef: WeakRef<Element>;
  selector: string;
}

class HandleRegistry {
  private handles = new Map<string, HandleEntry>();
  private sequence = 0;

  register(element: Element, selector: string): string {
    const handle = "h-" + Date.now() + "-" + ++this.sequence;
    this.handles.set(handle, {
      elementRef: new WeakRef(element),
      selector,
    });
    return handle;
  }

  resolve(handle: string): Element {
    const entry = this.handles.get(handle);
    if (!entry) {
      throw new Error("ERR_HANDLE_NOT_FOUND");
    }

    // Fast path: use cached element reference
    const cached = entry.elementRef.deref();
    if (cached?.isConnected) {
      return cached;
    }

    // Fallback: re-find element via selector
    const found = document.querySelector(entry.selector);
    if (found) {
      entry.elementRef = new WeakRef(found);
      return found;
    }

    this.handles.delete(handle);
    throw new Error("ERR_HANDLE_STALE");
  }

  clear() {
    this.handles.clear();
  }
}

export const handles = new HandleRegistry();
