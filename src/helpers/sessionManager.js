const BrowserHelper = require('./browserHelper');
const LinkedinService = require('../services/linkedinService');
const LogHelper = require('./logHelper');

class SessionManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._init();
        return this.initPromise;
    }

    async _init() {
        if (!this.browser) {
            LogHelper.info('Launching persistent browser session...');
            const { browser, page } = await BrowserHelper.initBrowser();
            this.browser = browser;
            this.page = page;
            await this.page.setDefaultNavigationTimeout(60000);
            LogHelper.info('Logging in to LinkedIn for persistent session...');
            const loginResult = await LinkedinService.login(this.page, this.browser);
            this.browser = loginResult.browser;
            this.page = loginResult.page;
            this.isLoggedIn = true;
        }
    }

    async getPage() {
        await this.init();

        // Check if page is valid before returning
        try {
            // Test if the page is still usable with a simple operation
            await this.page.evaluate(() => true);
            return this.page;
        } catch (error) {
            if (error.message.includes('detached Frame') ||
                error.message.includes('Session closed') ||
                error.message.includes('Target closed')) {
                LogHelper.info('Detected closed/detached page. Resetting session...');
                await this.resetSession();
                await this.init();
                return this.page;
            }
            throw error;
        }
    }

    async ensureLogin() {
        await this.init();

        try {
            if (!this.isLoggedIn) {
                LogHelper.info('Session not logged in, logging in...');
                const loginResult = await LinkedinService.login(this.page, this.browser);
                this.browser = loginResult.browser;
                this.page = loginResult.page;
                this.isLoggedIn = true;
            } else {
                // Verify login is still valid
                const isStillValid = await this.verifyLoginStatus();
                if (!isStillValid) {
                    LogHelper.info('Session expired, re-logging in...');
                    const loginResult = await LinkedinService.login(this.page, this.browser);
                    this.browser = loginResult.browser;
                    this.page = loginResult.page;
                    this.isLoggedIn = true;
                }
            }
        } catch (error) {
            if (error.message.includes('detached Frame') ||
                error.message.includes('Session closed') ||
                error.message.includes('Target closed')) {
                LogHelper.info('Detected closed/detached page during login. Resetting session...');
                await this.resetSession();
                await this.init();
                const loginResult = await LinkedinService.login(this.page, this.browser);
                this.browser = loginResult.browser;
                this.page = loginResult.page;
                this.isLoggedIn = true;
            } else {
                throw error;
            }
        }
    }

    // Add this new method
    async verifyLoginStatus() {
        try {
            // Simple test to see if we can access the page
            await this.page.evaluate(() => true);

            // Now verify LinkedIn login status
            return await LinkedinService.verifyLogin(this.page).catch(() => false);
        } catch (error) {
            if (error.message.includes('detached Frame') ||
                error.message.includes('Session closed') ||
                error.message.includes('Target closed')) {
                return false;
            }
            throw error;
        }
    }

    async resetSession() {
        if (this.browser) {
            await BrowserHelper.closeBrowser(this.browser);
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
            this.initPromise = null;
        }
    }
}

module.exports = new SessionManager();
