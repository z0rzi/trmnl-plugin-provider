import * as dotenv from "dotenv";
dotenv.config();

export function env(key: string): string {
    if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
    }

    return process.env[key];
}
