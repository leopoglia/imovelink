export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.replace("/login");
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  return response;
}
