import {
  getPostgres,
  withDatabaseTransaction,
} from "@/server/database/postgres";

export const authRepository = {
  async credential(userId: string): Promise<string | undefined> {
    const [row] =
      await getPostgres()`SELECT password_hash FROM imovelink.user_credentials WHERE user_id = ${userId}`;
    return row?.passwordHash;
  },
  async attempt(bucketHash: string): Promise<boolean> {
    const [row] =
      await getPostgres()`INSERT INTO imovelink.auth_attempts (bucket_hash) VALUES (${bucketHash})
      ON CONFLICT (bucket_hash) DO UPDATE SET
        attempts = CASE WHEN auth_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE LEAST(auth_attempts.attempts + 1, 11) END,
        window_start = CASE WHEN auth_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE auth_attempts.window_start END
      RETURNING attempts`;
    return row.attempts <= 10;
  },
  async issueLogin(
    userId: string,
    verifiedHash: string,
    sessionHash: string,
    rememberHash: string,
  ) {
    return withDatabaseTransaction(async () => {
      const sql = getPostgres();
      // Password changes lock this same row, preventing issuance with an obsolete hash.
      const [credential] =
        await sql`SELECT password_hash FROM imovelink.user_credentials WHERE user_id = ${userId} FOR SHARE`;
      if (credential?.passwordHash !== verifiedHash) return false;
      await sql`INSERT INTO imovelink.auth_sessions (token_hash, user_id, kind, expires_at)
        VALUES (${rememberHash}, ${userId}, 'REMEMBER', NOW() + INTERVAL '30 days')`;
      await sql`INSERT INTO imovelink.auth_sessions (token_hash, user_id, kind, parent_hash, expires_at)
        VALUES (${sessionHash}, ${userId}, 'SESSION', ${rememberHash}, NOW() + INTERVAL '12 hours')`;
      return true;
    });
  },
  async issueFromRemember(
    userId: string,
    rememberHash: string,
    sessionHash: string,
  ) {
    const rows =
      await getPostgres()`INSERT INTO imovelink.auth_sessions (token_hash, user_id, kind, parent_hash, expires_at)
      SELECT ${sessionHash}, user_id, 'SESSION', token_hash, LEAST(NOW() + INTERVAL '12 hours', expires_at)
      FROM imovelink.auth_sessions WHERE token_hash = ${rememberHash} AND user_id = ${userId}
        AND kind = 'REMEMBER' AND revoked_at IS NULL AND expires_at > NOW() RETURNING user_id`;
    return rows.length === 1;
  },
  async sessionUser(tokenHash: string): Promise<string | undefined> {
    const [row] =
      await getPostgres()`SELECT session.user_id FROM imovelink.auth_sessions session
      JOIN imovelink.auth_sessions parent ON parent.token_hash = session.parent_hash
      WHERE session.token_hash = ${tokenHash} AND session.kind = 'SESSION'
        AND session.revoked_at IS NULL AND session.expires_at > NOW()
        AND parent.revoked_at IS NULL AND parent.expires_at > NOW()`;
    return row?.userId;
  },
  async revoke(tokenHashes: string[]) {
    if (!tokenHashes.length) return;
    const sql = getPostgres();
    await sql`UPDATE imovelink.auth_sessions SET revoked_at = NOW() WHERE token_hash IN ${sql(tokenHashes)}
      OR token_hash IN (SELECT parent_hash FROM imovelink.auth_sessions WHERE token_hash IN ${sql(tokenHashes)})`;
  },
  async revokeSession(tokenHash: string) {
    await getPostgres()`UPDATE imovelink.auth_sessions SET revoked_at = NOW() WHERE token_hash = ${tokenHash} AND kind = 'SESSION'`;
  },
};
