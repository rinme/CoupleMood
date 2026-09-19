export const config = {
  runtime: 'edge',
};

/**
 * Vercel Edge proxy handler for CoupleMood API requests.
 * Transparently forwards all /api/* requests to the persistent backend server
 * configured in the BACKEND_URL environment variable.
 */
export default async function handler(req: Request): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return new Response(
      JSON.stringify({
        error: 'Backend not configured',
        message:
          'Please set the BACKEND_URL environment variable in your Vercel Project Settings (e.g. https://your-backend.onrender.com).',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  const url = new URL(req.url);
  const cleanBackend = backendUrl.replace(/\/+$/, '');
  const targetUrl = `${cleanBackend}${url.pathname}${url.search}`;

  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.delete('host');

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
    });

    const responseHeaders = new Headers(upstreamRes.headers);

    // Forward Set-Cookie headers properly across edge runtime
    if (typeof upstreamRes.headers.getSetCookie === 'function') {
      const cookies = upstreamRes.headers.getSetCookie();
      if (cookies && cookies.length > 0) {
        responseHeaders.delete('set-cookie');
        for (const cookie of cookies) {
          responseHeaders.append('set-cookie', cookie);
        }
      }
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Bad Gateway',
        message: `Failed to connect to backend at ${cleanBackend}: ${err?.message || 'Unknown network error'}`,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}
