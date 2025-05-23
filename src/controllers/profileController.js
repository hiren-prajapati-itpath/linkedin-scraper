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

// Rate limiting - track the timestamp of the last profile request
let lastProfileRequestTime = 0;

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

            // Apply rate limiting - ensure we wait between requests
            const now = Date.now();
            const timeSinceLastRequest = now - lastProfileRequestTime;
            const requiredDelay = config.RATE_LIMITING.PROFILE_REQUEST_DELAY_MS;

            if (lastProfileRequestTime > 0 && timeSinceLastRequest < requiredDelay) {
                // Need to wait before processing this request
                const waitTimeMs = requiredDelay - timeSinceLastRequest;
                LogHelper.info(`Rate limiting: Waiting ${Math.round(waitTimeMs / 1000)} seconds before processing next profile request`);

                await new Promise(resolve => setTimeout(resolve, waitTimeMs));
            }

            // Update the last request timestamp
            lastProfileRequestTime = Date.now();

            // Use persistent session
            const page = await sessionManager.getPage();
            await sessionManager.ensureLogin();

            // Navigate to profile and take screenshot
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