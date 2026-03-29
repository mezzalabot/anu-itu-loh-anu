const { io } = require('socket.io-client');
const { faker } = require('@faker-js/faker');
const https = require('https');

/**
 * GeneratorEmailService - pakai generator.email via Socket.IO
 * Domain: globalwork.dev (lolos filter Blink)
 */
class MailjsService {
    constructor(logger) {
        this.logger = logger;
        this.currentEmail = null;
        this.currentName = null;
        this.socket = null;
    }

    _randomName() {
        const first = faker.person.firstName().toLowerCase().replace(/[^a-z]/g, '');
        const last = faker.person.lastName().toLowerCase().replace(/[^a-z]/g, '');
        const num = Math.floor(Math.random() * 9000) + 1000;
        return `${first}${last}${num}`;
    }

    async _hitInboxPage(email) {
        return new Promise((resolve) => {
            const req = https.get(`https://generator.email/${email}`, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://generator.email/' },
                timeout: 10000
            }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve(d.length));
            });
            req.on('error', () => resolve(0));
            req.on('timeout', () => { req.destroy(); resolve(0); });
        });
    }

    /**
     * Create a new random inbox on generator.email
     */
    async createInbox() {
        this.logger.info('Creating generator.email inbox (HTTP mode)...');
        const name = this._randomName();
        const address = `${name}@globalwork.dev`;
        this.currentName = name;
        this.currentEmail = address;

        // Hit inbox page to activate
        await this._hitInboxPage(address);
        this.logger.info(`Inbox ready: ${address}`);
        return { address, password: 'N/A' };
    }

    /**
     * Wait for email with specific subject via Socket.IO
     */
    async waitForEmail(subjectFilter, maxRetries = 30) {
        this.logger.info(`Waiting for email on generator.email (HTTP polling)...`);
        const email = this.currentEmail;

        return new Promise((resolve, reject) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (this.socket) this.socket.disconnect();
                    reject(new Error('Timeout waiting for email from generator.email'));
                }
            }, maxRetries * 5000);

            this.socket = io('https://generator.email', {
                transports: ['polling', 'websocket'],
                path: '/socket.io/',
                timeout: 30000,
                reconnection: true,
                reconnectionAttempts: 5,
            });

            this.socket.on('connect', () => {
                this.logger.info(`Socket connected. Subscribing to ${email}...`);
                this.socket.emit('subscribe', email);
                this.socket.emit('adduser', email);
            });

            this.socket.onAny((event, ...args) => {
                if (['ping', 'pong', 'connect', 'disconnect'].includes(event)) return;

                const data = JSON.stringify(args);
                this.logger.info(`Socket event: ${event}`);

                // Cek apakah ada magic token URL
                const magicMatch = data.match(/https:\\\/\\\/blink\.new\\\/auth\?magic_token=[^"'\\s]+/);
                const magicMatch2 = data.match(/https:\/\/blink\.new\/auth\?magic_token=[^"'\s]+/);
                const match = magicMatch || magicMatch2;

                if (match) {
                    const url = match[0].replace(/\\\//g, '/');
                    this.logger.info(`Magic token URL captured!`);
                    clearTimeout(timeout);
                    resolved = true;
                    this.socket.disconnect();
                    resolve({ id: Date.now().toString(), body: data, html: data });
                } else if (data.toLowerCase().includes('sign in') || data.toLowerCase().includes('blink')) {
                    clearTimeout(timeout);
                    resolved = true;
                    this.socket.disconnect();
                    resolve({ id: Date.now().toString(), body: data, html: data });
                }
            });

            this.socket.on('connect_error', (err) => {
                this.logger.info(`Socket error: ${err.message} - falling back to HTTP polling`);
                // Fallback: HTTP polling
                this._httpPoll(email, subjectFilter, maxRetries).then(result => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        resolve(result);
                    }
                }).catch(err => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(err);
                    }
                });
            });
        });
    }

    async _httpPoll(email, subjectFilter, maxRetries) {
        const { execSync } = require('child_process');
        const MAILSAC_KEY = process.env.MAILSAC_KEY || 'k_zVYJb7VDfReqtg3Nbv5uakncesa9LKtT9sA5058';

        // Fallback ke mailsac jika socket.io gagal
        this.logger.info(`Fallback: polling mailsac untuk ${email.split('@')[0]}@mailsac.com`);

        // Buat email baru di mailsac
        const name = email.split('@')[0];
        const mailsacEmail = `${name}@mailsac.com`;

        for (let i = 0; i < maxRetries; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const result = execSync([
                    'curl', '-s', '-H', `Mailsac-Key: ${MAILSAC_KEY}`,
                    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    `https://mailsac.com/api/addresses/${mailsacEmail}/messages`
                ].join(' '), { timeout: 15000, encoding: 'utf8' });

                const msgs = JSON.parse(result);
                if (Array.isArray(msgs) && msgs.length > 0) {
                    const msg = msgs.find(m => (m.subject || '').includes(subjectFilter));
                    if (msg) {
                        const body = execSync([
                            'curl', '-s', '-H', `Mailsac-Key: ${MAILSAC_KEY}`,
                            '-A', 'Mozilla/5.0',
                            `https://mailsac.com/api/text/${mailsacEmail}/${msg._id}`
                        ].join(' '), { timeout: 15000, encoding: 'utf8' });
                        return { id: msg._id, body, html: body };
                    }
                }
            } catch (e) {
                this.logger.info(`HTTP poll error: ${e.message}`);
            }
        }
        throw new Error('Timeout in HTTP fallback polling');
    }

    /**
     * Extract Blink magic token URL from email body
     */
    extractMagicTokenUrl(emailBody) {
        const decoded = emailBody.replace(/&amp;/g, '&').replace(/\\\/\\\//g, '//').replace(/\\\//g, '/');
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>&\]\\]+/;
        const match = decoded.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
