import { getDbPool } from "@/lib/server/db";

type QueryRunner = {
  query: (text: string, values?: unknown[]) => Promise<{ rowCount?: number; rows: unknown[] }>;
};

let savepointSeq = 0;

async function safeDelete(
  runner: QueryRunner,
  sql: string,
  values: unknown[],
): Promise<number> {
  const savepointName = `sp_delete_${(savepointSeq += 1)}`;
  await runner.query(`SAVEPOINT ${savepointName}`);

  try {
    const result = await runner.query(sql, values);
    await runner.query(`RELEASE SAVEPOINT ${savepointName}`);
    return Number(result.rowCount || 0);
  } catch (error: any) {
    // Keep transaction usable after a statement-level failure.
    await runner.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    await runner.query(`RELEASE SAVEPOINT ${savepointName}`);

    // Allow deployments where optional tables/columns may differ.
    if (error?.code === "42P01" || error?.code === "42703") return 0;
    throw error;
  }
}

export async function deleteUserAccountData(userId: string) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await safeDelete(
      client,
      `
      DELETE FROM bogopa.chat_messages
      WHERE session_id IN (
        SELECT id FROM bogopa.chat_sessions WHERE user_id = $1
      )
      `,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.chat_sessions WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.letters WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.personas WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.user_payment_cards WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.user_attendance_logs WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.user_attendance_states WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.user_iap_purchases WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.mobile_auth_transfers WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.user_memory_transactions WHERE user_id = $1`,
      [userId],
    );

    await safeDelete(
      client,
      `DELETE FROM bogopa.user_entitlements WHERE user_id = $1`,
      [userId],
    );

    const userDeleteCount = await safeDelete(
      client,
      `DELETE FROM bogopa."users" WHERE id = $1`,
      [userId],
    );

    await client.query("COMMIT");
    return {
      deleted: true,
      deletedUserRow: userDeleteCount > 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
