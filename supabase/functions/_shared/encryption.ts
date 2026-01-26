
import { encode as hexEncode, decode as hexDecode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // Recommended for GCM

async function getKey(): Promise<CryptoKey> {
    const keyHex = Deno.env.get("ENCRYPTION_KEY");
    if (!keyHex) throw new Error("Missing ENCRYPTION_KEY");

    // Import raw key from hex
    const keyBytes = new Uint8Array(hexDecode(new TextEncoder().encode(keyHex)));

    return await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: ALGORITHM },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encrypt(text: string): Promise<string> {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(text);

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoded
    );

    // Return IV:Ciphertext (hex encoded)
    const ivHex = new TextDecoder().decode(hexEncode(iv));
    const cipherHex = new TextDecoder().decode(hexEncode(new Uint8Array(ciphertext)));

    return `${ivHex}:${cipherHex}`;
}

export async function decrypt(encryptedText: string): Promise<string> {
    const key = await getKey();
    const [ivHex, cipherHex] = encryptedText.split(':');

    if (!ivHex || !cipherHex) throw new Error("Invalid encrypted format");

    const iv = new Uint8Array(hexDecode(new TextEncoder().encode(ivHex)));
    const ciphertext = new Uint8Array(hexDecode(new TextEncoder().encode(cipherHex)));

    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}
