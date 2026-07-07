export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

export function todo(message: string, extra: Record<string, unknown> = {}) {
  return { success: false, message: `TODO: ${message}`, ...extra };
}

export function ok<T extends Record<string, unknown>>(data: T = {} as T) {
  return { success: true, ...data };
}
