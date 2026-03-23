import { getDbPool } from "../lib/server/db";

async function main() {
    const pool = getDbPool();

    console.log("Connecting to the database...");

    try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS bogopa;`);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS bogopa."users" (
        "id" VARCHAR PRIMARY KEY,
        "name" VARCHAR NOT NULL,
        "email" VARCHAR,
        "image" VARCHAR,
        "provider" VARCHAR NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log("Schema 'bogopa' and table 'users' verified/created successfully.");
    } catch (error) {
        console.error("Failed to execute query", error);
        process.exit(1);
    }

    process.exit(0);
}

main();
