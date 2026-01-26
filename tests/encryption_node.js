
// Adapting the Deno encryption logic for Node.js verification
const { webcrypto } = require('crypto');
const crypto = webcrypto;

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

// Mock Env
const MOCK_KEY = "858fdcb7cc5d8cc17f479e9e2accbfb052389614875ea0b462d9d514d80dd6c2e";

function hexDecode(string) {
    const bytes = new Uint8Array(string.length / 2);
    for (let i = 0; i < string.length; i += 2) {
        bytes[i / 2] = parseInt(string.substr(i, 2), 16);
    }
    return bytes;
}

function hexEncode(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function getKey() {
    const keyBytes = hexDecode(MOCK_KEY);
    return await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: ALGORITHM },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encrypt(text) {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(text);

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoded
    );

    const ivHex = hexEncode(iv);
    const cipherHex = hexEncode(new Uint8Array(ciphertext));
    return `${ivHex}:${cipherHex}`;
}

async function decrypt(encryptedText) {
    const key = await getKey();
    const [ivHex, cipherHex] = encryptedText.split(':');

    const iv = hexDecode(ivHex);
    const ciphertext = hexDecode(cipherHex);

    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}

// Test Runner
(async () => {
    try {
        console.log("Testing Encryption...");
        const original = "my_secret_token_value_123";
        const encrypted = await encrypt(original);
        console.log("Encrypted:", encrypted);

        const decrypted = await decrypt(encrypted);
        console.log("Decrypted:", decrypted);

        if (original === decrypted) {
            console.log("✅ SUCCESS: Encryption/Decryption verified.");
        } else {
            console.error("❌ FAILED: Mismatch.");
            process.exit(1);
        }
    } catch (err) {
        console.error("❌ ERROR:", err);
        process.exit(1);
    }
})();
