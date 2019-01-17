import { Pool, PoolClient } from "pg";


export const pool = new Pool({
    database: "captain-hook"
});


export async function withTransaction<T>(f: (client: PoolClient) => Promise<T>): Promise<T> {

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const r = await f(client);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

}
