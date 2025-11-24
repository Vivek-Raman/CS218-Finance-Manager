import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getAccessToken, refreshAccessToken } from "../services/auth"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Authenticated fetch helper that automatically adds Authorization header
 * and handles token refresh on 401 errors
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let accessToken = getAccessToken()

  // If no token, try to refresh
  if (!accessToken) {
    accessToken = await refreshAccessToken()
  }

  // Add Authorization header
  const headers = new Headers(options.headers)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  // Make the request
  let response = await fetch(url, {
    ...options,
    headers,
  })

  // If 401, try refreshing token and retry once
  if (response.status === 401 && accessToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      response = await fetch(url, {
        ...options,
        headers,
      })
    }
  }

  return response
}

