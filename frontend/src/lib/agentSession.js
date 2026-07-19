const SESSION_KEY = "fridgeDinner:agentSessionId:v1";

export function getAgentSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return "";
  }
}

export function createAgentRequestId() {
  return window.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function agentSessionHeaders(requestId = createAgentRequestId()) {
  const sessionId = getAgentSessionId();
  return {
    ...(sessionId ? { "x-agent-session-id": sessionId } : {}),
    ...(requestId ? { "x-agent-request-id": requestId } : {}),
  };
}
