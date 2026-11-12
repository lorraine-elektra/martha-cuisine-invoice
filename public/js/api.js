// Small wrapper around fetch: sends JSON, sends you to the login page if the session ended.
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = "/login.html";
    throw new Error("Please log in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export function wireLogout() {
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login.html";
  });
}
