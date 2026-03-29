const https = require('https');
const { faker } = require('@faker-js/faker');

const MAILSAC_KEY = process.env.MAILSAC_KEY || 'k_zVYJb7VDfReqtg3Nbv5uakncesa9LKtT9sA5058';

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

    async createInbox() {
        const name = this._randomName();
        const address = `${name}@mailsac.com`;
        this.currentEmail = address;
        this.logger.info(`Mailsac inbox ready: ${address}`);
        return { address, password: 'N/A' };
    }

    _get(path) {
        return new Promise((resolve, reject) => {
            https.get({
                hostname: 'mailsac.com',
                path: `/api${path}`,
                headers: {
                    'Mailsac-Key': MAILSAC_KEY,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(d)); }
                    catch(e) { resolve(d); }  // text response (email body)
                });
            }).on('error', reject);
        });
    }

    async waitForEmail(subjectFilter, maxRetries = 10) {
        this.logger.info(`Polling mailsac for: "${subjectFilter}"...`);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const msgs = await this._get(`/addresses/${this.currentEmail}/messages`);
                if (Array.isArray(msgs) && msgs.length > 0) {
                    const msg = msgs.find(m => (m.subject || '').includes(subjectFilter));
                    if (msg) {
                        this.logger.info(`✅ Email found: "${msg.subject}"`);
                        // /text/ endpoint return plain text bukan JSON — handle langsung sebagai string
                        const bodyStr = await new Promise((resolve, reject) => {
                            https.get({
                                hostname: 'mailsac.com',
                                path: `/api/text/${this.currentEmail}/${msg._id}`,
                                headers: { 'Mailsac-Key': MAILSAC_KEY, 'User-Agent': 'Mozilla/5.0' }
                            }, res => {
                                let d = '';
                                res.on('data', c => d += c);
                                res.on('end', () => resolve(d));
                            }).on('error', reject);
                        });
                        return { id: msg._id, body: bodyStr, html: bodyStr };
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
        const decoded = emailBody.replace(/&amp;/g, '&').replace(/&#038;/g, '&');
        // Capture full URL termasuk &email= parameter (wajib untuk verifyMagicToken)
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>\]]+/;
        const match = decoded.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
