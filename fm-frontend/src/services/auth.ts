/**
 * Cognito Authentication Service
 * Handles authentication with AWS Cognito User Pool using Hosted UI (OAuth)
 */

// Get Cognito configuration from environment variables
const getClientId = (): string => {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!clientId) {
    console.error('VITE_COGNITO_CLIENT_ID is not set. Please check your environment variables.');
    throw new Error('Cognito Client ID is not configured');
  }
  return clientId;
};

const getDomain = (): string => {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  if (!domain) {
    console.error('VITE_COGNITO_DOMAIN is not set. Please check your environment variables.');
    throw new Error('Cognito Domain is not configured');
  }
  return domain;
};

const getRedirectUri = (): string => {
  return import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin + '/auth/callback';
};

const getRegion = (): string => {
  const envRegion = import.meta.env.VITE_COGNITO_REGION;
  if (envRegion) {
    return envRegion;
  }
  
  const domain = getDomain();
  if (domain) {
    const match = domain.match(/\.auth\.([^.]+)\.amazoncognito\.com/);
    if (match) {
      return match[1];
    }
  }
  return 'us-west-1';
};

/**
 * Get the Cognito hosted UI URL
 */
export const getHostedUIUrl = (): string => {
  const envUrl = import.meta.env.VITE_COGNITO_HOSTED_UI_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl;
  }
  
  const region = getRegion();
  const domain = getDomain();
  
  if (!domain || domain.trim() === '') {
    throw new Error('Cognito domain is not configured. Please set VITE_COGNITO_DOMAIN or VITE_COGNITO_HOSTED_UI_URL environment variable.');
  }
  
  if (!region || region.trim() === '') {
    throw new Error('AWS region is not configured. Please set VITE_COGNITO_REGION environment variable.');
  }
  
  return `https://${domain}.auth.${region}.amazoncognito.com`;
};

/**
 * Generate PKCE code verifier and challenge
 */
const generatePKCE = async (): Promise<{ codeVerifier: string; codeChallenge: string }> => {
  const codeVerifier = generateRandomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
};

const generateRandomString = (length: number): string => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
};

/**
 * Redirect to Cognito Hosted UI for login
 */
export const redirectToLogin = async (): Promise<void> => {
  try {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    
    const clientId = getClientId();
    const redirectUri = getRedirectUri();
    const hostedUIUrl = getHostedUIUrl();
    
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_redirect_uri', redirectUri);
    
    if (!clientId) {
      throw new Error('Cognito Client ID is missing');
    }
    
    if (!hostedUIUrl || hostedUIUrl.includes('undefined') || hostedUIUrl === 'https://.auth.') {
      throw new Error('Cognito Hosted UI URL is malformed. Check VITE_COGNITO_DOMAIN and VITE_COGNITO_REGION environment variables.');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${hostedUIUrl}/oauth2/authorize?${params.toString()}`;
    window.location.href = authUrl;
  } catch (error) {
    console.error('Error redirecting to login:', error);
    alert(`Authentication configuration error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check your environment variables.`);
    throw error;
  }
};

/**
 * Handle OAuth callback and exchange authorization code for tokens
 */
export const handleAuthCallback = async (): Promise<{ accessToken: string; idToken: string; refreshToken: string } | null> => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  const errorDescription = urlParams.get('error_description');

  if (error) {
    const errorMessage = errorDescription 
      ? `${error}: ${decodeURIComponent(errorDescription)}`
      : error;
    throw new Error(errorMessage);
  }

  if (!code) {
    return null;
  }

  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
  if (!codeVerifier) {
    return null;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
  await new Promise(resolve => setTimeout(resolve, 200));

  const storedRedirectUri = sessionStorage.getItem('oauth_redirect_uri');
  const redirectUri = storedRedirectUri || getRedirectUri();

  try {
    const clientId = getClientId();
    const hostedUIUrl = getHostedUIUrl();

    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(`${hostedUIUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Unknown error' };
      }
      
      const errorMessage = errorData.error_description || errorData.error || `Token exchange failed: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const tokens = await response.json();
    
    sessionStorage.setItem('cognito_access_token', tokens.access_token);
    sessionStorage.setItem('cognito_id_token', tokens.id_token);
    sessionStorage.setItem('cognito_refresh_token', tokens.refresh_token);
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('oauth_redirect_uri');

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Get current access token from storage
 */
export const getAccessToken = (): string | null => {
  return sessionStorage.getItem('cognito_access_token');
};

/**
 * Get current ID token from storage
 */
export const getIdToken = (): string | null => {
  return sessionStorage.getItem('cognito_id_token');
};

/**
 * Get current refresh token from storage
 */
export const getRefreshToken = (): string | null => {
  return sessionStorage.getItem('cognito_refresh_token');
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const clientId = getClientId();
    const hostedUIUrl = getHostedUIUrl();

    const response = await fetch(`${hostedUIUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const tokens = await response.json();
    
    sessionStorage.setItem('cognito_access_token', tokens.access_token);
    sessionStorage.setItem('cognito_id_token', tokens.id_token);
    
    if (tokens.refresh_token) {
      sessionStorage.setItem('cognito_refresh_token', tokens.refresh_token);
    }

    return tokens.access_token;
  } catch (error) {
    clearTokens();
    return null;
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!getAccessToken();
};

/**
 * Sign out - redirect to Cognito logout
 */
export const signOut = (): void => {
  const clientId = getClientId();
  const redirectUri = window.location.origin + '/';
  const hostedUIUrl = getHostedUIUrl();
  
  clearTokens();
  window.location.href = `${hostedUIUrl}/logout?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
};

/**
 * Clear all stored tokens
 */
export const clearTokens = (): void => {
  sessionStorage.removeItem('cognito_access_token');
  sessionStorage.removeItem('cognito_id_token');
  sessionStorage.removeItem('cognito_refresh_token');
  sessionStorage.removeItem('pkce_code_verifier');
  sessionStorage.removeItem('oauth_redirect_uri');
};

/**
 * Decode JWT token to get user info
 */
export const decodeToken = (token: string): any => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
};

/**
 * Get current user info from ID token
 */
export const getCurrentUser = (): { username?: string; name?: string; sub?: string; email?: string } | null => {
  const idToken = getIdToken();
  if (!idToken) {
    return null;
  }

  const decoded = decodeToken(idToken);
  if (!decoded) {
    return null;
  }

    return {
    username: decoded['cognito:username'] || decoded.username || decoded.preferred_username,
    name: decoded.name || decoded['cognito:username'] || decoded.username,
    sub: decoded.sub,
    email: decoded.email,
  };
};

