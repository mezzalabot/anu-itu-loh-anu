const { execSync } = require('child_process');

const MAILSAC_KEY = process.env.MAILSAC_KEY || 'k_zVYJb7VDfReqtg3Nbv5uakncesa9LKtT9sA5058';

/**
 * MailsacService - pakai mailsac.com (lolos filter Blink)
 * Akses via curl untuk bypass Cloudflare
 */
class MailjsService {
    constructor(logger) {
        this.logger = logger;
        this.currentEmail = null;
    }

    _randomStr(n = 12) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < n; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    _curlGet(url) {
        try {
            const result = execSync(
                `curl -s -H "Mailsac-Key: ${MAILSAC_KEY}" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "${url}"`,
                { timeout: 30000, encoding: 'utf8' }
            );
            return JSON.parse(result);
        } catch (e) {
            throw new Error(`curl failed: ${e.message}`);
        }
    }

    _curlGetText(url) {
        try {
            return execSync(
                `curl -s -H "Mailsac-Key: ${MAILSAC_KEY}" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "${url}"`,
                { timeout: 30000, encoding: 'utf8' }
            );
        } catch (e) {
            throw new Error(`curl failed: ${e.message}`);
        }
    }

    /**
     * Create a new random inbox on mailsac.com
     */
    async createInbox() {
        const name = this._randomStr(14);
        const address = `${name}@mailsac.com`;
        this.currentEmail = address;
        this.logger.info(`Mailsac inbox created: ${address}`);
        return { address, password: 'N/A' };
    }

    /**
     * Wait for email with specific subject
     */
    async waitForEmail(subjectFilter, maxRetries = 24) {
        this.logger.info(`Waiting for email with subject: "${subjectFilter}" (mailsac.com)...`);
        // Blink butuh ~30 detik untuk deliver email — tunggu dulu sebelum polling
        this.logger.info('⏳ Initial delay 30s (Blink email delivery time)...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        for (let i = 0; i < maxRetries; i++) {
            try {
                const messages = this._curlGet(
                    `https://mailsac.com/api/addresses/${this.currentEmail}/messages`
                );

                if (Array.isArray(messages) && messages.length > 0) {
                    const msg = messages.find(m =>
                        (m.subject || '').includes(subjectFilter)
                    );

                    if (msg) {
                        this.logger.info('Email found! Fetching body...');
                        const body = this._curlGetText(
                            `https://mailsac.com/api/text/${this.currentEmail}/${msg._id}`
                        );
                        return {
                            id: msg._id,
                            body: body || '',
                            html: body || ''
                        };
                    }
                }
            } catch (e) {
                this.logger.info(`Poll ${i + 1} error: ${e.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error('Timeout waiting for email on mailsac.com');
    }

    /**
     * Extract Blink magic token URL from email body
     */
    extractMagicTokenUrl(emailBody) {
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>]+/;
        const match = emailBody.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
