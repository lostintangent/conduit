export const generateId = () =>
  window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
