const UserUpload = require('../models/UserUpload');

function skipOwnershipEnforcement() {
  const v = (process.env.PROXY_SKIP_FILE_OWNERSHIP || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * When JWT user is present (unless PROXY_SKIP_FILE_OWNERSHIP), require a UserUpload row
 * so clients cannot probe arbitrary file_ids.
 */
async function assertFileOwnedByProxyUser(req, fileId) {
  if (!req.proxyUserId || skipOwnershipEnforcement()) return null;
  const fid = String(fileId || '').trim();
  if (!fid) return { status: 400, json: { success: false, detail: { code: 'BAD_REQUEST', message: 'file_id required' } } };
  const ok = await UserUpload.exists({ userId: req.proxyUserId, fileId: fid });
  if (!ok) {
    return {
      status: 403,
      json: {
        success: false,
        detail: {
          code: 'FILE_ACCESS_DENIED',
          message: 'This file is not registered for your account. Use GET /user-uploads for allowed file_id values.',
        },
      },
    };
  }
  return null;
}

/** Override body.user_id with cookie user when verified (prevents spoofing). */
function mergeProxyUserIntoBody(req, body) {
  const out = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (req.proxyUserId) out.user_id = req.proxyUserId;
  return out;
}

/** Override query.user_id with cookie user when verified. */
function mergeProxyUserIntoQuery(req, query) {
  const out = query && typeof query === 'object' ? { ...query } : {};
  if (req.proxyUserId) out.user_id = req.proxyUserId;
  return out;
}

/** MAG body may reference file_id for memory resolution — enforce ownership when present. */
async function assertMagBodyFileAccess(req, body) {
  const fid = body?.file_id;
  if (!fid || typeof fid !== 'string') return null;
  return assertFileOwnedByProxyUser(req, fid.trim());
}

module.exports = {
  assertFileOwnedByProxyUser,
  assertMagBodyFileAccess,
  mergeProxyUserIntoBody,
  mergeProxyUserIntoQuery,
};
