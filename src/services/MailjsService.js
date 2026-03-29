const axios = require('axios');
const { faker } = require('@faker-js/faker');

const MAILSAC_KEY = process.env.MAILSAC_KEY || 'k_zVYJb7VDfReqtg3Nbv5uakncesa9LKtT9sA5058';

/**
 * MailsacService - pakai mailsac.com (lolos filter Blink, terbukti berhasil)
 * Polling via axios (cross-platform, Windows safe)
 */
class MailjsService {
    constructor(logger) {
        this.logger = logger;
        this.currentEmail = null;

        this.client = axios.create({
            baseURL: 'https://mailsac.com/api',
            headers: {
                'Mailsac-Key': MAILSAC_KEY,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
    }

    _randomName() {
        const first = faker.person.firstName().toLowerCase().replace(/[^a-z]/g, '');
        const last = faker.person.lastName().toLowerCase().replace(/[^a-z]/g, '');
        const num = Math.floor(Math.random() * 9000) + 1000;
        return `${first}${last}${num}`;
    }

    async createInbox() {
        const name = this._randomName();
        const address = `${name}@mailsac.com`;
        this.currentEmail = address;
        this.logger.info(`Mailsac inbox ready: ${address}`);
        return { address, password: 'N/A' };
    }

    async waitForEmail(subjectFilter, maxRetries = 40) {
        this.logger.info(`Polling mailsac for: "${subjectFilter}"...`);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await this.client.get(`/addresses/${this.currentEmail}/messages`);
                const msgs = res.data;

                if (Array.isArray(msgs) && msgs.length > 0) {
                    const msg = msgs.find(m => (m.subject || '').includes(subjectFilter));
                    if (msg) {
                        this.logger.info(`✅ Email found: "${msg.subject}"`);
                        const bodyRes = await this.client.get(`/text/${this.currentEmail}/${msg._id}`);
                        const body = typeof bodyRes.data === 'string' ? bodyRes.data : JSON.stringify(bodyRes.data);
                        return { id: msg._id, body, html: body };
                    }
                }
            } catch (e) {
                this.logger.info(`Poll ${i + 1} error: ${e.message}`);
            }

            this.logger.info(`Poll ${i + 1}/${maxRetries}: waiting 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error('Timeout waiting for email on mailsac.com');
    }

    extractMagicTokenUrl(emailBody) {
        const decoded = emailBody.replace(/&amp;/g, '&');
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>&\]]+/;
        const match = decoded.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
