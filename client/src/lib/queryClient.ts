import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

const RETRY_DELAYS = [2000, 4000, 6000]; // ms between retries on 503

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: RequestInfo, init?: RequestInit): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.status !== 503 && res.status !== 502) return res;
      lastRes = res;
    } catch (err) {
      if (attempt === RETRY_DELAYS.length) throw err;
    }
    if (attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
  return lastRes!;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetchWithRetry(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetchWithRetry(`${API_BASE}${queryKey.join("/")}`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: 2,
      retryDelay: (attempt) => RETRY_DELAYS[attempt] ?? 6000,
    },
    mutations: {
      retry: false,
    },
  },
});
