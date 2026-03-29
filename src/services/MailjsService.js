const axios = require('axios');
const { faker } = require('@faker-js/faker');

/**
 * GeneratorEmail - pakai generator.email (lolos filter Blink)
 * Domain: globalwork.dev
 * Polling via HTTP scraping
 */
class MailjsService {
    constructor(logger) {
        this.logger = logger;
        this.currentEmail = null;
        this.currentName = null;

        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://generator.email/'
            }
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
        const address = `${name}@globalwork.dev`;
        this.currentName = name;
        this.currentEmail = address;
        this.logger.info(`Generator.email inbox ready: ${address}`);

        // Hit inbox page to activate
        try {
            await this.httpClient.get(`https://generator.email/${address}`);
        } catch (e) {
            // Ignore
        }

        return { address, password: 'N/A' };
    }

    async waitForEmail(subjectFilter, maxRetries = 40) {
        this.logger.info(`Polling generator.email for: "${subjectFilter}"...`);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await this.httpClient.get(`https://generator.email/${this.currentEmail}`);
                const html = res.data || '';

                // Cari magic token URL
                const magicMatch = html.match(/https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>&]+/);
                if (magicMatch) {
                    const magicUrl = magicMatch[0].replace(/&amp;/g, '&');
                    this.logger.info(`✅ Magic token found in inbox!`);
                    return { id: Date.now().toString(), body: html, html };
                }

                // Cek apakah ada email dari blink
                if (html.includes('auth@blink.new') || html.toLowerCase().includes('sign in to blink')) {
                    this.logger.info(`✅ Blink email found!`);
                    return { id: Date.now().toString(), body: html, html };
                }

            } catch (e) {
                this.logger.info(`Poll ${i + 1} error: ${e.message}`);
            }

            this.logger.info(`Poll ${i + 1}/${maxRetries}: waiting 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error('Timeout waiting for email on generator.email');
    }

    extractMagicTokenUrl(emailBody) {
        const decoded = emailBody.replace(/&amp;/g, '&');
        const regex = /https:\/\/blink\.new\/auth\?magic_token=[^\s"'<>&\]]+/;
        const match = decoded.match(regex);
        return match ? match[0] : null;
    }
}

module.exports = MailjsService;
