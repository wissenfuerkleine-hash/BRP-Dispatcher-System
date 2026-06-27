export interface SupportSession {
  citizenId: string;
  supporterId: string;
  roomId: string;
  startedAt: Date;
}

export const waitingQueue: string[] = [];

export const activeSessions = new Map<string, SupportSession>();

export const pendingDispatch = new Set<string>();
