import type { TerminalSession } from "../types";

const sessions = new Map<string, TerminalSession>();

export const storeSession = (session: TerminalSession) => {
  sessions.set(session.id, session);
};

export const getSession = (sessionId: string): TerminalSession | undefined =>
  sessions.get(sessionId);

export const getAllSessions = () => sessions;

export const removeSession = (sessionId: string) => {
  sessions.delete(sessionId);
};
