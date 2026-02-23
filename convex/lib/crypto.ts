"use node";

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SEPARATOR = ":";

function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error(
            "ENCRYPTION_KEY environment variable is not set. " +
            "Set it in the Convex dashboard (Settings > Environment Variables) " +
            "using a 64-character hex string (openssl rand -hex 32)."
        );
    }
    if (key.length !== 64) {
        throw new Error(
            "ENCRYPTION_KEY must be a 64-character hex string (256 bits). " +
            `Current length: ${key.length}`
        );
    }
    return Buffer.from(key, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a string in the format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return [
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted,
    ].join(SEPARATOR);
}

/**
 * Decrypts a string that was encrypted with encrypt().
 * Expects format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function decrypt(encryptedValue: string): string {
    const key = getEncryptionKey();
    const parts = encryptedValue.split(SEPARATOR);

    if (parts.length !== 3) {
        throw new Error("Invalid encrypted value format. Expected iv:authTag:ciphertext");
    }

    const [ivB64, authTagB64, ciphertext] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

/**
 * Checks whether a value appears to be in the encrypted format.
 * Used during migration to avoid double-encrypting existing values.
 */
export function isEncrypted(value: string): boolean {
    const parts = value.split(SEPARATOR);
    if (parts.length !== 3) return false;

    try {
        const iv = Buffer.from(parts[0], "base64");
        const authTag = Buffer.from(parts[1], "base64");
        return iv.length === IV_LENGTH && authTag.length === AUTH_TAG_LENGTH;
    } catch {
        return false;
    }
}
