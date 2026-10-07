import { sendJson } from '../supabase-server.mjs';
export default function handler(req, res) { sendJson(res, 404, { error: 'This service is unavailable. Please contact the shop.' }); }
