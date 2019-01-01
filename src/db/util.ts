import { Pool, PoolClient } from "pg";


export const pool = new Pool({
    database: "captain-hook"
});


export async function withTransaction(f: (client: PoolClient) => Promise<any>) {

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await f(client);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

}
