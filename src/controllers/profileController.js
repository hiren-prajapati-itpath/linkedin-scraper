// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// const LinkedinService = require('../services/linkedinService');
// const BrowserHelper = require('../helpers/browserHelper');
// const FileHelper = require('../helpers/fileHelper');
// const LogHelper = require('../helpers/logHelper');
// const config = require('../config/config');
// const path = require('path');
// const fs = require('fs').promises;

// puppeteer.use(StealthPlugin());

// class ProfileController {
//     static async takeScreenshot(req, res) {
//         let browser;
//         try {
//             const { profileUrl } = req.body;

//             if (!profileUrl || !profileUrl.includes('linkedin.com/')) {
//                 return res.status(400).json({ 
//                     error: 'Invalid LinkedIn URL', 
//                     message: 'Please provide a valid LinkedIn profile URL' 
//                 });
//             }

//             // Initialize browser with stealth mode
//             let { browser: newBrowser, page } = await BrowserHelper.initBrowser();
//             browser = newBrowser;

//             // Set navigation timeout
//             await page.setDefaultNavigationTimeout(60000);

//             // Step 1: Login to LinkedIn
//             LogHelper.info('Starting LinkedIn login process...');
//             const loginResult = await LinkedinService.login(page, browser);
//             // Update browser and page references if changed during login (e.g., due to CAPTCHA)
//             browser = loginResult.browser;
//             page = loginResult.page;

//             // Step 2: Navigate to profile and take screenshot
//             LogHelper.info(`Navigating to profile: ${profileUrl}`);
//             const { success, screenshotPath } = await LinkedinService.navigateToProfile(page, profileUrl);

//             if (!success) {
//                 throw new Error('Failed to capture profile screenshot');
//             }

//             LogHelper.info('Profile screenshot captured successfully');
//             res.sendFile(path.resolve(screenshotPath));

//         } catch (error) {
//             LogHelper.error('Profile screenshot operation failed:', error);

//             let statusCode = 500;
//             if (error.message.includes('Invalid LinkedIn URL')) {
//                 statusCode = 400;
//             } else if (error.message.includes('Profile not found')) {
//                 statusCode = 404;
//             }

//             res.status(statusCode).json({
//                 error: 'Screenshot operation failed',
//                 message: error.message
//             });

//         } finally {
//             if (browser) {
//                 try {
//                     await browser.close();
//                     LogHelper.info('Browser closed successfully');
//                 } catch (err) {
//                     LogHelper.error('Error closing browser:', err);
//                 }
//             }
//         }
//     }
// }

// module.exports = ProfileController;

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const LinkedinService = require('../services/linkedinService');
const BrowserHelper = require('../helpers/browserHelper');
const FileHelper = require('../helpers/fileHelper');
const LogHelper = require('../helpers/logHelper');
const config = require('../config/config');
const path = require('path');
const fs = require('fs').promises;
const sessionManager = require('../helpers/sessionManager');

puppeteer.use(StealthPlugin());

class ProfileController {
    static async takeScreenshot(req, res) {
        try {
            const { profileUrl } = req.body;

            if (!profileUrl || !profileUrl.includes('linkedin.com/')) {
                return res.status(400).json({
                    error: 'Invalid LinkedIn URL',
                    message: 'Please provide a valid LinkedIn profile URL'
                });
            }

            // Use persistent session
            const page = await sessionManager.getPage();
            await sessionManager.ensureLogin();

            // Step 2: Navigate to profile and take screenshot
            LogHelper.info(`Navigating to profile: ${profileUrl}`);
            const { success, screenshotPath } = await LinkedinService.navigateToProfile(page, profileUrl);

            if (!success) {
                throw new Error('Failed to capture profile screenshot');
            }

            LogHelper.info('Profile screenshot captured successfully');
            res.sendFile(path.resolve(screenshotPath));

        } catch (error) {
            LogHelper.error('Profile screenshot operation failed:', error);

            let statusCode = 500;
            if (error.message.includes('Invalid LinkedIn URL')) {
                statusCode = 400;
            } else if (error.message.includes('Profile not found')) {
                statusCode = 404;
            }

            res.status(statusCode).json({
                error: 'Screenshot operation failed',
                message: error.message
            });
        }
    }
}

module.exports = ProfileController;