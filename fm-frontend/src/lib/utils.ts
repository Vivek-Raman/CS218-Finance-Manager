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

/**
 * Format date as "dd MMM yyyy hh:mm XXX" where XXX is timezone abbreviation like PST, PDT
 * If time is 00:00 or not specified, omit time and timezone
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const day = date.getDate().toString().padStart(2, '0')
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  
  // If time is 00:00 or not specified, return only date
  if (hours === 0 && minutes === 0) {
    return `${day} ${month} ${year}`
  }
  
  // Get timezone abbreviation (e.g., PST, PDT, EST, EDT)
  const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
  })
  const parts = timezoneFormatter.formatToParts(date)
  const timezone = parts.find(part => part.type === 'timeZoneName')?.value || ''
  
  const hoursStr = hours.toString().padStart(2, '0')
  const minutesStr = minutes.toString().padStart(2, '0')
  
  return `${day} ${month} ${year} ${hoursStr}:${minutesStr} ${timezone}`
}

