// Tiny fetch helpers used by all UI components

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { cache: 'no-store' }))
}

export async function apiPost<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )
}

export async function apiPatch<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )
}

export async function apiDelete<T>(url: string, headers?: Record<string, string>): Promise<T> {
  return handle<T>(await fetch(url, { method: 'DELETE', headers }))
}
