const { execSync } = require('child_process');
const { faker } = require('@faker-js/faker');

const MAILSAC_KEY = process.env.MAILSAC_KEY || 'k_zVYJb7VDfReqtg3Nbv5uakncesa9LKtT9sA5058';

/**
 * MailsacService - pakai mailsac.com (lolos filter Blink, API proven works)
 * Polling via curl untuk bypass Cloudflare
 */
class MailjsService {
    constructor(logger) {
        this.logger = logger;
        this.currentEmail = null;
    }

    _randomName() {
        const first = faker.person.firstName().toLowerCase().replace(/[^a-z]/g, '');
        const last = faker.person.lastName().toLowerCase().replace(/[^a-z]/g, '');
        const num = Math.floor(Math.random() * 9000) + 1000;
        return `${first}${last}${num}`;
    }

    _curl(url, extraHeaders = []) {
        const headers = [
            '-H', `Mailsac-Key: ${MAILSAC_KEY}`,
            '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ];
        for (const h of extraHeaders) headers.push('-H', h);
        
        const result = execSync(
            `curl -s ${headers.join(' ')} "${url}"`,
            { timeout: 30000, encoding: 'utf8' }
        );
        return result;
    }

    /**
     * Create a new random inbox on mailsac.com
     * Mailsac does NOT require registration for random addresses!
     */
    async createInbox() {
        const name = this._randomName();
        const address = `${name}@mailsac.com`;
        this.currentEmail = address;
        this.logger.info(`Mailsac inbox ready: ${address}`);
        return { address, password: 'N/A' };
    }

    /**
     * Wait for email with specific subject via curl polling
     */
    async waitForEmail(subjectFilter, maxRetries = 30) {
        this.logger.info(`Polling mailsac for: "${subjectFilter}"...`);

        // Initial delay: Blink butuh ~30 detik untuk deliver email
        this.logger.info('⏳ Initial delay 30s (Blink delivery time)...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        for (let i = 0; i < maxRetries; i++) {
            try {
                const raw = this._curl(
                    `https://mailsac.com/api/addresses/${this.currentEmail}/messages`
                );
                const msgs = JSON.parse(raw);

                if (Array.isArray(msgs) && msgs.length > 0) {
                    const msg = msgs.find(m => (m.subject || '').includes(subjectFilter));
                    if (msg) {
                        this.logger.info(`✅ Email found: "${msg.subject}"`);
                        const body = this._curl(
                            `https://mailsac.com/api/text/${this.currentEmail}/${msg._id}`
                        );
                        return { id: msg._id, body, html: body };
                    }
                }
            } catch (e) {
                this.logger.info(`Poll ${i + 1} error: ${e.message}`);
            }

            this.logger.info(`Poll ${i + 1}/${maxRetries}: no email yet, wait 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error('Timeout waiting for email on mailsac.com');
    }

    /**
     * Extract Blink magic token URL from email body
     */
    extractMagicTokenUrl(emailBody) {
        const decoded = emailBody.replace(/&amp;/g, '&');
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>&\]]+/;
        const match = decoded.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
