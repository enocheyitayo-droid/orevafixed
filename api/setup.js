import { ApiProblem, functionHandler, sendJson } from '../supabase-server.mjs';

export default functionHandler(async (req, res) => {
  if (req.method === 'GET') {
    sendJson(res, 200, { enabled: false, codeRequired: false, message: 'Create the owner in Supabase Authentication and add its user ID to bagz_private.owners.' });
    return;
  }
  throw new ApiProblem('Public owner setup is closed. Create/sign in to an owner account through the Supabase project.', 403);
});
