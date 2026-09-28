import { ApiProblem, csrfToken, functionHandler, parseBody, sendJson, setSessionCookies, supabase } from '../supabase-server.mjs';

export default functionHandler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  if (req.headers.origin !== (process.env.SITE_ORIGIN || 'https://oreva-ashy.vercel.app')) {
    throw new ApiProblem('Request origin not allowed.', 403);
  }
  const { email, password } = parseBody(req);
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 300) {
    throw new ApiProblem('Enter your owner email and password.');
  }
  let session;
  try {
    session = await supabase('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
    });
  } catch {
    throw new ApiProblem('Owner sign-in failed. Check the email and password, then try again.', 401);
  }
  const isOwner = await supabase('/rest/v1/rpc/bagz_is_owner', {
    method: 'POST', accessToken: session.access_token, body: {},
  });
  if (isOwner !== true) throw new ApiProblem('This Supabase account is not designated as a store owner.', 403);
  const csrf = csrfToken();
  setSessionCookies(res, session, csrf);
  sendJson(res, 200, { csrf });
});
