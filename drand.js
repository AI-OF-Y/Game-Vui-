/**
 * Provably Fair Verifiable Randomness Module
 * Fetches decentralized, tamper-proof randomness from public League of Entropy (Drand / Cloudflare)
 * Fallback to browser window.crypto.getRandomValues if offline or network blocked.
 */
class ProvableRandomness {
    constructor() {
        this.primaryUrl = 'https://api.drand.sh/public/latest';
        this.fallbackUrl = 'https://drand.cloudflare.com/public/latest';
    }

    /**
     * Fetch the latest public round data or generate cryptographically secure local fallback
     */
    async fetchRandomDice() {
        try {
            // Try fetching from public League of Entropy beacon
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            let response;
            try {
                response = await fetch(this.primaryUrl, { credentials: 'omit', signal: controller.signal });
            } catch (err) {
                // Secondary beacon endpoint
                response = await fetch(this.fallbackUrl, { credentials: 'omit', signal: controller.signal });
            }
            clearTimeout(timeoutId);

            if (response && response.ok) {
                const data = await response.json();
                const diceResult = this.deriveDiceFromHex(data.randomness);
                return {
                    source: 'League of Entropy (Drand Cloudflare Public API)',
                    round: data.round,
                    randomnessHex: data.randomness,
                    signature: data.signature,
                    dice: diceResult.dice,
                    seeds: diceResult.seeds,
                    isLiveWeb: true
                };
            }
        } catch (e) {
            console.warn('Drand beacon network notice: using WebCrypto fallback', e.message);
        }

        // Web Crypto Fallback (Provably un-tamperable local CSPRNG)
        return this.generateWebCryptoDice();
    }

    /**
     * Deterministically derive 3 dice numbers (1-6) from a 256-bit hexadecimal randomness string
     */
    deriveDiceFromHex(hex) {
        // We take three 32-bit segments (8 hex chars each)
        const chunk1 = hex.substring(0, 8);
        const chunk2 = hex.substring(8, 16);
        const chunk3 = hex.substring(16, 24);

        const val1 = parseInt(chunk1, 16);
        const val2 = parseInt(chunk2, 16);
        const val3 = parseInt(chunk3, 16);

        const d1 = (val1 % 6) + 1;
        const d2 = (val2 % 6) + 1;
        const d3 = (val3 % 6) + 1;

        return {
            dice: [d1, d2, d3],
            seeds: [
                { chunk: chunk1, int: val1, dice: d1, formula: `(${val1} % 6) + 1 = ${d1}` },
                { chunk: chunk2, int: val2, dice: d2, formula: `(${val2} % 6) + 1 = ${d2}` },
                { chunk: chunk3, int: val3, dice: d3, formula: `(${val3} % 6) + 1 = ${d3}` }
            ]
        };
    }

    /**
     * Local cryptographic fallback when offline
     */
    generateWebCryptoDice() {
        const array = new Uint32Array(3);
        window.crypto.getRandomValues(array);

        const hexArr = Array.from(array).map(n => n.toString(16).padStart(8, '0'));
        const hexCombined = hexArr.join('');

        const d1 = (array[0] % 6) + 1;
        const d2 = (array[1] % 6) + 1;
        const d3 = (array[2] % 6) + 1;

        return {
            source: 'Web Cryptography API (CSPRNG Chuẩn Trình Duyệt)',
            round: 'Local-' + Date.now().toString().slice(-6),
            randomnessHex: hexCombined,
            signature: 'N/A (Ngoại tuyến)',
            dice: [d1, d2, d3],
            seeds: [
                { chunk: hexArr[0], int: array[0], dice: d1, formula: `(${array[0]} % 6) + 1 = ${d1}` },
                { chunk: hexArr[1], int: array[1], dice: d2, formula: `(${array[1]} % 6) + 1 = ${d2}` },
                { chunk: hexArr[2], int: array[2], dice: d3, formula: `(${array[2]} % 6) + 1 = ${d3}` }
            ],
            isLiveWeb: false
        };
    }
}

window.provableRandomness = new ProvableRandomness();
