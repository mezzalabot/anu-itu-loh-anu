const https = require('https');

/**
 * TempMailPlusService - pakai tempmail.plus (lolos filter Blink)
 */
class MailjsService {
    constructor(logger) {
        this.logger = logger;
        this.currentEmail = null;
        this.currentEpin = '';
    }

    _randomStr(n = 12) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < n; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    async _fetch(url) {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                timeout: 30000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error(`Parse error: ${data.substring(0, 100)}`)); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        });
    }

    /**
     * Create a new random inbox on tempmail.plus
     */
    async createInbox() {
        this.logger.info('Creating tempmail.plus account...');
        const name = this._randomStr(12);
        const address = `${name}@tempmail.plus`;
        this.currentEmail = name;
        this.currentEpin = '';
        this.logger.info(`tempmail.plus account created: ${address}`);
        return { address, password: 'N/A' };
    }

    /**
     * Wait for email with specific subject
     */
    async waitForEmail(subjectFilter, maxRetries = 30) {
        this.logger.info(`Waiting for email with subject containing: "${subjectFilter}" (tempmail.plus)...`);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const url = `https://tempmail.plus/api/mails?email=${this.currentEmail}&limit=10&epin=${this.currentEpin}&first_id=0`;
                const data = await this._fetch(url);

                if (data.result && data.mail_list && data.mail_list.length > 0) {
                    const msg = data.mail_list.find(m =>
                        (m.subject || '').includes(subjectFilter) ||
                        (m.text || '').includes(subjectFilter)
                    );

                    if (msg) {
                        this.logger.info('Verification email found! Fetching full content...');
                        const fullUrl = `https://tempmail.plus/api/mails/${msg.mail_id}?email=${this.currentEmail}&epin=${this.currentEpin}`;
                        const fullMsg = await this._fetch(fullUrl);
                        return {
                            id: msg.mail_id,
                            body: fullMsg.text || fullMsg.html || '',
                            html: fullMsg.html || ''
                        };
                    }
                }
            } catch (e) {
                this.logger.info(`Poll error: ${e.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error('Timeout waiting for verification email on tempmail.plus');
    }

    /**
     * Extract Blink magic token URL from email body
     */
    extractMagicTokenUrl(emailBody) {
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^ \n\r\t"]+/;
        const match = emailBody.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
