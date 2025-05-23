const fs = require('fs').promises;
const path = require('path');
const LogHelper = require('../helpers/logHelper');
const FileHelper = require('../helpers/fileHelper');
const BrowserHelper = require('../helpers/browserHelper');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class LinkedinService {
    static async login(page, browser) {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                LogHelper.info('Navigating to LinkedIn login page...');
                await page.goto('https://www.linkedin.com/login', {
                    waitUntil: 'networkidle2',
                    timeout: 60000
                });

                // Check for navigation errors
                if (!page.url().includes('linkedin.com')) {
                    throw new Error('Failed to reach LinkedIn login page');
                }

                // Fill login form
                await this.fillLoginForm(page);

                // Submit form and handle navigation
                LogHelper.info('Submitting login form...');
                await Promise.all([
                    page.click('button[type="submit"]'),
                    page.waitForNavigation({
                        waitUntil: 'networkidle2',
                        timeout: 60000
                    }).catch(async () => {
                        // If navigation timeout occurs, check if we're on CAPTCHA page
                        const currentUrl = await page.url();
                        if (currentUrl.includes('checkpoint/challenge')) {
                            return; // Allow the flow to continue to CAPTCHA handling
                        }
                        throw new Error('Navigation timeout and not on CAPTCHA page');
                    })
                ]);

                // Handle CAPTCHA if present - this is the only manual step
                if (await this.detectCaptcha(page)) {
                    LogHelper.info('CAPTCHA detected. Opening manual solver window...');
                    // Switch to visible mode for manual captcha solving
                    const { browser: newBrowser, page: newPage } = await BrowserHelper.switchToVisibleMode(browser, page);

                    // Update references
                    browser = newBrowser;
                    page = newPage;

                    LogHelper.info('============================================');
                    LogHelper.info('PLEASE SOLVE THE CAPTCHA IN THE BROWSER WINDOW');
                    LogHelper.info('The automation will continue automatically after solving');
                    LogHelper.info('============================================');

                    // Wait for CAPTCHA solution
                    const solved = await this.waitForCaptchaSolution(page);
                    if (!solved) {
                        throw new Error('CAPTCHA solving timeout');
                    }

                    LogHelper.info('CAPTCHA has been solved successfully! Continuing automation...');

                    // Wait for a short time after CAPTCHA solution
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Ensure we're properly redirected after CAPTCHA
                    if ((await page.url()).includes('checkpoint/challenge')) {
                        await page.reload({ waitUntil: 'networkidle2' });
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }

                // Verify the login was successful
                const isLoggedIn = await this.verifyLogin(page);
                if (!isLoggedIn) {
                    throw new Error('Login verification failed');
                }

                LogHelper.info('Successfully logged in and verified');
                return { browser, page };

            } catch (error) {
                retryCount++;
                LogHelper.error(`Login attempt ${retryCount} failed:`, error);

                if (retryCount >= maxRetries) {
                    throw new Error(`Login failed after ${maxRetries} attempts: ${error.message}`);
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    static async handleCaptcha(page, browser) {
        try {
            LogHelper.info('CAPTCHA detected - switching to visible mode for manual solving...');

            // Switch to visible mode with current page state
            const { browser: visibleBrowser, page: visiblePage } = await BrowserHelper.switchToVisibleMode(browser, page);

            // Maximize the window to ensure CAPTCHA is fully visible
            try {
                const session = await visibleBrowser.target().createCDPSession();
                await session.send('Browser.setWindowBounds', {
                    windowId: 1,
                    bounds: { windowState: 'maximized' }
                });
            } catch (e) {
                LogHelper.info('Could not maximize window, continuing...');
            }

            // Ensure we're seeing the CAPTCHA page
            const pageUrl = await visiblePage.url();
            if (!pageUrl.includes('checkpoint/challenge')) {
                LogHelper.info('Not on CAPTCHA page, attempting to reload...');
                await visiblePage.reload({ waitUntil: 'networkidle2' });
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for CAPTCHA to render
            }

            // Add a prominent overlay with instructions
            await visiblePage.evaluate(() => {
                // Remove any existing overlay first
                const existingOverlay = document.getElementById('captcha-overlay');
                if (existingOverlay) {
                    existingOverlay.remove();
                }

                // Create an overlay with clear instructions
                const overlay = document.createElement('div');
                overlay.id = 'captcha-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.padding = '15px';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                overlay.style.color = 'white';
                overlay.style.zIndex = '9999';
                overlay.style.fontSize = '16px';
                overlay.style.textAlign = 'center';
                overlay.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
                overlay.style.borderBottom = '2px solid #0073b1';
                overlay.style.fontFamily = 'Arial, sans-serif';

                // Create an animated attention indicator
                const pulseAnimation = document.createElement('style');
                pulseAnimation.textContent = `
                    @keyframes pulse {
                        0% { background-color: rgba(0, 115, 177, 0.8); }
                        50% { background-color: rgba(0, 115, 177, 0.6); }
                        100% { background-color: rgba(0, 115, 177, 0.8); }
                    }
                    #captcha-overlay {
                        animation: pulse 2s infinite;
                    }
                `;
                document.head.appendChild(pulseAnimation);

                // Create content for the overlay
                overlay.innerHTML = `
                    <h2 style="margin: 0; color: white; font-size: 18px;">⚠️ CAPTCHA Verification Required ⚠️</h2>
                    <p style="margin: 8px 0;">Please solve the CAPTCHA challenge below to continue</p>
                    <p style="margin: 5px 0; font-size: 14px;">The browser will automatically continue once the verification is complete</p>
                `;

                document.body.appendChild(overlay);

                // Function to check if CAPTCHA is still visible
                window._checkCaptchaInterval = setInterval(() => {
                    // Check if we're still on a CAPTCHA page
                    if (!window.location.href.includes('checkpoint/challenge')) {
                        // CAPTCHA solved, redirect happened
                        clearInterval(window._checkCaptchaInterval);
                        const overlay = document.getElementById('captcha-overlay');
                        if (overlay) {
                            overlay.innerHTML = `<h2 style="margin: 0; color: white;">✅ CAPTCHA Solved!</h2><p>Continuing to profile...</p>`;
                            overlay.style.backgroundColor = 'rgba(0, 128, 0, 0.8)';
                            overlay.style.animation = 'none';

                            // Remove the overlay after 3 seconds
                            setTimeout(() => {
                                if (overlay && overlay.parentNode) {
                                    overlay.parentNode.removeChild(overlay);
                                }
                            }, 3000);
                        }
                    }
                }, 1000);
            });

            LogHelper.info('============================================');
            LogHelper.info('PLEASE SOLVE THE CAPTCHA IN THE BROWSER WINDOW');
            LogHelper.info('The window will close automatically after solving');
            LogHelper.info('============================================');

            // Wait for CAPTCHA to be solved
            const solved = await this.waitForCaptchaSolution(visiblePage);

            if (!solved) {
                throw new Error('CAPTCHA solving timeout');
            }

            LogHelper.info('CAPTCHA solved successfully!');

            // Clean up any remaining UI elements
            await visiblePage.evaluate(() => {
                // Clear any intervals
                if (window._checkCaptchaInterval) {
                    clearInterval(window._checkCaptchaInterval);
                }

                // Remove overlay if it still exists
                const overlay = document.getElementById('captcha-overlay');
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }

                // Remove any other CAPTCHA message elements
                const captchaMessage = document.getElementById('captcha-wait-message');
                if (captchaMessage && captchaMessage.parentNode) {
                    captchaMessage.parentNode.removeChild(captchaMessage);
                }
            });

            LogHelper.info('CAPTCHA solved successfully. Switching back to headless mode...');

            // Show success message to the user before switching back to headless
            await visiblePage.evaluate(() => {
                const successMsg = document.createElement('div');
                successMsg.style.position = 'fixed';
                successMsg.style.top = '0';
                successMsg.style.left = '0';
                successMsg.style.width = '100%';
                successMsg.style.padding = '15px';
                successMsg.style.backgroundColor = 'rgba(0, 128, 0, 0.8)';
                successMsg.style.color = 'white';
                successMsg.style.zIndex = '9999';
                successMsg.style.fontSize = '16px';
                successMsg.style.textAlign = 'center';
                successMsg.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
                successMsg.style.fontFamily = 'Arial, sans-serif';
                successMsg.innerHTML = `<h2 style="margin: 0; color: white;">✅ CAPTCHA Solved!</h2><p>Continuing automation in background mode...</p>`;
                document.body.appendChild(successMsg);
            });

            // Brief pause to show success message
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Switch back to headless mode
            const { browser: headlessBrowser, page: headlessPage } = await BrowserHelper.switchToHeadlessMode(visibleBrowser, visiblePage);

            // Return the new headless browser and page instances
            return {
                browser: headlessBrowser,
                page: headlessPage
            };

        } catch (error) {
            LogHelper.error('CAPTCHA handling failed:', error);
            throw error;
        }
    }

    static async waitForCaptchaSolution(page) {
        const maxAttempts = 60; // 10 minutes max wait
        const checkInterval = 10000; // Check every 10 seconds
        LogHelper.info('Waiting for manual CAPTCHA solution...');

        // Add a progress tracker directly in the page
        await page.evaluate(() => {
            // Only create the message box if it doesn't exist
            if (!document.getElementById('captcha-wait-message')) {
                const messageBox = document.createElement('div');
                messageBox.id = 'captcha-wait-message';
                messageBox.style.position = 'fixed';
                messageBox.style.bottom = '10px';
                messageBox.style.right = '10px';
                messageBox.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                messageBox.style.color = 'white';
                messageBox.style.padding = '10px 20px';
                messageBox.style.borderRadius = '5px';
                messageBox.style.zIndex = '9999';
                messageBox.style.fontFamily = 'Arial, sans-serif';
                messageBox.style.fontSize = '14px';
                messageBox.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
                messageBox.style.border = '1px solid #0073b1';
                messageBox.style.maxWidth = '300px';
                messageBox.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 20px; height: 20px; border: 2px solid #fff; border-radius: 50%; border-top-color: transparent; animation: spin 1s linear infinite;"></div>
                        <div>Waiting for CAPTCHA solution...</div>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                `;
                document.body.appendChild(messageBox);
            }
        });

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                // Wait for the page to be in a stable state
                await page.waitForFunction(() => document.readyState === 'complete', {
                    timeout: 5000
                }).catch(() => {
                    // Ignore timeout - page might still be loading
                });

                // First check if we're still on a challenge page
                const currentUrl = await page.url();
                if (!currentUrl.includes('checkpoint/challenge')) {
                    LogHelper.info('No longer on CAPTCHA page, solution accepted!');
                    // Small delay to ensure redirect is complete
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return true;
                }

                // Multiple detailed detection methods for CAPTCHA completion

                // Method 1: Check if CAPTCHA is still visible
                const hasCaptcha = await this.detectCaptcha(page);
                if (!hasCaptcha) {
                    LogHelper.info('CAPTCHA no longer detected, solution accepted!');
                    // Small delay to ensure redirect is complete
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return true;
                }

                // Method 2: Check for submission in progress
                const isSubmitting = await page.evaluate(() => {
                    // Look for submission indicators
                    return document.querySelector('button[disabled]') !== null ||
                        document.querySelector('form.submitting') !== null ||
                        document.body.innerText.toLowerCase().includes('verifying') ||
                        document.body.innerText.toLowerCase().includes('processing');
                });

                if (isSubmitting) {
                    LogHelper.info('CAPTCHA submission in progress, waiting for completion...');
                    // Give extra time for the submission to complete
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }

                // Method 3: Check if we're on a LinkedIn page (after successful CAPTCHA)
                if (currentUrl.includes('linkedin.com/feed') ||
                    currentUrl.includes('linkedin.com/in/') ||
                    currentUrl.includes('linkedin.com/mynetwork')) {
                    LogHelper.info('Successfully redirected to LinkedIn main page!');
                    return true;
                }

                // Method 4: Check if the page contains success messages
                const hasSuccess = await page.evaluate(() => {
                    const pageText = document.body.innerText.toLowerCase();
                    return pageText.includes('success') ||
                        pageText.includes('verified') ||
                        pageText.includes('welcome back');
                });

                if (hasSuccess) {
                    LogHelper.info('Success message detected, verification complete!');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return true;
                }

                // Update the waiting message on page
                await page.evaluate((attemptNum, maxAttempts) => {
                    const messageBox = document.getElementById('captcha-wait-message');
                    if (messageBox) {
                        const minutes = Math.floor(attemptNum / 6);
                        const remainingMins = Math.floor((maxAttempts - attemptNum) / 6);
                        messageBox.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 20px; height: 20px; border: 2px solid #fff; border-radius: 50%; border-top-color: transparent; animation: spin 1s linear infinite;"></div>
                                <div>
                                    <div>Waiting for CAPTCHA solution...</div>
                                    <div style="font-size: 12px; margin-top: 4px;">
                                        Elapsed: ${minutes} min, Remaining: ${remainingMins} min
                                    </div>
                                </div>
                            </div>
                            <style>
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            </style>
                        `;
                    }
                }, attempt, maxAttempts);

                // If we're still waiting, log the progress
                if (attempt % 3 === 0) { // Log every 30 seconds
                    LogHelper.info(`Still waiting for CAPTCHA solution... (${Math.floor(attempt / 6)} minutes elapsed)`);
                }

                await new Promise(resolve => setTimeout(resolve, checkInterval));
            } catch (error) {
                LogHelper.error('Error checking CAPTCHA status:', error);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause on error
            }
        }

        // Clean up UI elements before timing out
        await page.evaluate(() => {
            const messageBox = document.getElementById('captcha-wait-message');
            if (messageBox && messageBox.parentNode) {
                messageBox.parentNode.removeChild(messageBox);
            }
        });

        LogHelper.error('Timed out waiting for CAPTCHA solution');
        return false;
    }

    static async safeElementDetection(page, selector) {
        try {
            return await page.$(selector);
        } catch (error) {
            if (error.message.includes('detached Frame') ||
                error.message.includes('Session closed')) {
                return null;
            }
            throw error;
        }
    }

    static async detectCaptcha(page) {
        try {
            // Check URL first
            try {
                const currentUrl = await page.url();
                if (currentUrl.includes('checkpoint/challenge') ||
                    currentUrl.includes('checkpoint/challenge/recaptcha') ||
                    currentUrl.includes('checkpoint/challenge/email-confirmation') ||
                    currentUrl.includes('checkpoint/challenge/edd') ||
                    currentUrl.includes('security-verification')) {
                    return true;
                }
            } catch (urlError) {
                if (urlError.message.includes('detached Frame') ||
                    urlError.message.includes('Session closed')) {
                    LogHelper.info('Frame detached during URL check in detectCaptcha');
                    return false; // Can't determine CAPTCHA state with detached frame
                }
                throw urlError;
            }

            // Check for common CAPTCHA and verification elements
            const captchaSelectors = [
                // Traditional CAPTCHA elements
                'input[name="pin"]',
                'iframe[title*="challenge"]',
                'iframe[title*="verification"]',
                'iframe[title*="recaptcha"]',
                'iframe[src*="recaptcha"]',
                'iframe[src*="captcha"]',
                '#captcha-challenge',
                '.challenge-dialog',
                '.captcha-container',

                // LinkedIn verification specific elements
                '.checkpoint-challenge',
                '.challenge-containment',
                '.challenge-v2',
                '#captcha-internal',
                '[data-test-id="verification-code-input"]',
                '[data-test-id="security-challenge"]',

                // Text input fields used for verification
                'input[name="verification-code"]',
                'input[name="security-code"]',
                'input[name="email-pin"]',
                'input[name="phone-pin"]',

                // Buttons related to verification
                'button[data-test-id="verify-button"]',
                'button[data-test-id="submit-button"]',
                'button[data-test-id="captcha-submit"]',
                'button[aria-label*="verify"]',

                // Google reCAPTCHA elements
                '.g-recaptcha',
                '.recaptcha-checkbox',
                '.recaptcha-verify-button',

                // Generic security and challenge elements
                '.security-verification',
                '.security-challenge',
                '.verification-form',
                '.challenge-content'
            ];

            for (const selector of captchaSelectors) {
                const element = await this.safeElementDetection(page, selector);
                if (element) return true;
            }

            // Check for reCAPTCHA frames
            try {
                const frames = page.frames();
                const hasCaptchaFrame = frames.some(frame => {
                    try {
                        const url = frame.url();
                        return url.includes('recaptcha') ||
                            url.includes('captcha') ||
                            url.includes('challenge');
                    } catch (e) {
                        return false; // Ignore errors in individual frames
                    }
                });

                if (hasCaptchaFrame) {
                    return true;
                }
            } catch (frameError) {
                if (frameError.message.includes('detached Frame') ||
                    frameError.message.includes('Session closed')) {
                    LogHelper.info('Frame detached during frame check in detectCaptcha');
                    return false;
                }
                throw frameError;
            }

            // Check page content for CAPTCHA related text
            try {
                const pageContent = await page.content();
                const captchaKeywords = [
                    'verification challenge',
                    'security check',
                    "let's do a quick security check",
                    'prove you\'re not a robot',
                    'confirm your identity',
                    'unusual login attempt',
                    'verify it\'s you',
                    'verification code',
                    'security verification',
                    'human verification',
                    'automated access',
                    'suspicious activity',
                    'bot detection',
                    'unusual activity',
                    'security concern',
                    'identity check',
                    'two-step verification',
                    'enter the code',
                    'verify your account',
                    'verify your identity',
                    'we need to verify',
                    'not a robot',
                    'robot check',
                    // LinkedIn specific verification phrases
                    'we detected unusual activity',
                    'check your inbox for a verification link',
                    'help us keep your account secure',
                    'confirm it\'s you',
                    'security verification step'
                ];

                return captchaKeywords.some(keyword =>
                    pageContent.toLowerCase().includes(keyword.toLowerCase())
                );
            } catch (contentError) {
                if (contentError.message.includes('detached Frame') ||
                    contentError.message.includes('Session closed')) {
                    LogHelper.info('Frame detached during content check in detectCaptcha');
                    return false;
                }
                throw contentError;
            }

        } catch (error) {
            LogHelper.error('Error in CAPTCHA detection:', error);
            return false;
        }
    }

    static async verifyLogin(page) {
        try {
            LogHelper.info('Verifying login status...');

            // First check if we're on a valid LinkedIn page
            const currentUrl = await page.url();
            if (!currentUrl.includes('linkedin.com')) {
                throw new Error('Not on LinkedIn domain');
            }

            // Check for CAPTCHA first
            const hasCaptcha = await this.detectCaptcha(page);
            if (hasCaptcha) {
                throw new Error('CAPTCHA still present after login');
            }

            // Wait for page to be fully loaded
            await page.waitForFunction(() => document.readyState === 'complete');

            // Give a short delay for dynamic content
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Try multiple verification methods
            const isLoggedIn = await page.evaluate(() => {
                // Method 1: Check for global nav elements
                const navElements = [
                    // Updated selectors for 2025 LinkedIn UI
                    'div[data-test-id="nav-bar"]',
                    'div[data-test-id="global-nav"]',
                    '.global-nav',
                    '.global-nav__nav',
                    '.global-nav__primary-items',
                    // Messaging and notification indicators
                    '.msg-overlay-bubble-header',
                    '.notification-badge',
                    // Search bar
                    '.search-global-typeahead',
                    '.global-nav__search',
                    // Profile elements
                    '.global-nav__me',
                    '.feed-identity-module',
                    '[data-test-id="nav-settings"]'
                ];

                // Method 2: Check for feed/content elements
                const contentElements = [
                    '.share-box-feed-entry__wrapper',
                    '.feed-shared-update-v2',
                    '.share-box',
                    '.feed-creation-state',
                    '.feed-shared-card',
                    '[data-test-id="feed-content"]'
                ];

                // Method 3: Check for common authenticated page elements
                const authenticatedElements = [
                    // Profile/identity elements
                    '.profile-rail-card',
                    '.feed-identity-module__actor-meta',
                    '.identity-panel',
                    // Navigation links
                    'a[href="/feed/"]',
                    'a[href="/in/"]',
                    'a[href="/jobs/"]',
                    'a[href="/messaging/"]',
                    // Action buttons
                    '[data-control-name="share.post"]',
                    '[data-test-id="post-share-button"]'
                ];

                // Method 4: Check page title
                const hasAuthTitle = document.title.includes('Feed') ||
                    document.title.includes('My Network') ||
                    document.title.includes('Jobs') ||
                    document.title.includes('LinkedIn');

                // Combine all checks
                const hasNavElement = navElements.some(selector => document.querySelector(selector));
                const hasContentElement = contentElements.some(selector => document.querySelector(selector));
                const hasAuthElement = authenticatedElements.some(selector => document.querySelector(selector));

                // Return true if any verification method succeeds
                return hasNavElement || hasContentElement || hasAuthElement || hasAuthTitle;
            });

            if (isLoggedIn) {
                LogHelper.info('Login verified successfully');
                return true;
            }

            // Final check: Look for any obvious sign we're logged out
            const isLoggedOut = await page.evaluate(() => {
                const logoutIndicators = [
                    'a[href="/login"]',
                    '.sign-in-form',
                    '[data-test-id="sign-in-button"]',
                    '#session_key',
                    '#session_password'
                ];
                return logoutIndicators.some(selector => document.querySelector(selector));
            });

            if (isLoggedOut) {
                throw new Error('Found login form elements - not logged in');
            }

            // If we get here, we can't definitively say if we're logged in or not
            LogHelper.info('Could not definitively verify login status - proceeding with caution');
            return true;

        } catch (error) {
            LogHelper.error('Login verification failed:', error);
            throw error;
        }
    }

    static async navigateToProfile(page, profileUrl) {
        try {
            LogHelper.info(`Navigating to profile: ${profileUrl}`);

            // First verify we are logged in
            const isLoggedIn = await this.verifyLogin(page);
            if (!isLoggedIn) {
                LogHelper.info('Not logged in, attempting login first...');
                const loginResult = await this.login(page, page.browser());
                page = loginResult.page;
                browser = loginResult.browser;
            }

            // Set a more realistic viewport size
            await page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
            });

            // Add stealth measures
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

            // Add extra headers to look more like a real browser
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            });

            // Ensure URL is properly formatted and has https:// prefix
            let formattedUrl = profileUrl.trim();
            if (!formattedUrl.startsWith('http')) {
                formattedUrl = `https://${formattedUrl}`;
            }
            // Ensure the URL is a valid LinkedIn profile URL
            if (!formattedUrl.includes('linkedin.com')) {
                formattedUrl = `https://www.linkedin.com/in/${formattedUrl.replace(/^.*[/]in[/]?/, '')}`;
            }

            LogHelper.info(`Formatted profile URL: ${formattedUrl}`);

            // Store the target profile URL - this is important for returning after CAPTCHA
            const targetProfileUrl = formattedUrl;

            // Set cookies if available
            const cookies = await page.cookies();
            if (cookies.length > 0) {
                await page.setCookie(...cookies);
            }

            // Wait a bit before navigation
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Add polyfills and fixes before navigation to avoid common LinkedIn errors
            await page.evaluateOnNewDocument(() => {
                // Fix "Notification is not defined" error
                window.Notification = {
                    permission: 'default',
                    requestPermission: () => Promise.resolve('default')
                };

                // Silence CORS errors
                const originalFetch = window.fetch;
                if (originalFetch) {
                    window.fetch = function (...args) {
                        return originalFetch.apply(this, args).catch(error => {
                            if (error.toString().includes('CORS')) {
                                console.log('Silenced CORS error for:', args[0]);
                                return Promise.resolve(new Response('', { status: 200 }));
                            }
                            return Promise.reject(error);
                        });
                    };
                }

                // Prevent LinkedIn's anti-automation checks
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                // Fix common object errors
                if (!window.localStorage) {
                    window.localStorage = {
                        getItem: () => null,
                        setItem: () => { },
                        removeItem: () => { }
                    };
                }

                // Improve content loading
                const originalAppendChild = Element.prototype.appendChild;
                Element.prototype.appendChild = function () {
                    try {
                        return originalAppendChild.apply(this, arguments);
                    } catch (e) {
                        console.log('Silenced appendChild error');
                        return arguments[0];
                    }
                };
            });

            // Navigate with longer timeout and wait for network idle
            await page.goto(targetProfileUrl, {
                waitUntil: ['domcontentloaded'],
                timeout: 10000,
                referer: 'https://www.google.com/' // Make it look like we came from Google
            });

            // Handle potential errors right after navigation
            // Check if we're on a valid LinkedIn page
            const pageUrl = await page.url();
            if (!pageUrl.includes('linkedin.com')) {
                LogHelper.error(`Navigation landed on non-LinkedIn page: ${pageUrl}`);
                throw new Error('Navigation failed - not on LinkedIn domain');
            }

            // Log JavaScript console to help with debugging
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    // Filter out known LinkedIn errors
                    const errorText = msg.text();
                    if (errorText.includes('Notification') ||
                        errorText.includes('static.licdn.com') ||
                        errorText.includes('CORS policy') ||
                        errorText.includes('Failed to load resource')) {
                        // Silently ignore common LinkedIn errors
                        return;
                    }
                    LogHelper.info(`Console error: ${errorText}`);
                }
            });

            // Wait for initial page load with random delay
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 2000));

            await page.waitForFunction(() => document.readyState === 'complete', {
                timeout: 10000
            }).catch(error => {
                LogHelper.info(`Page loading timeout warning: ${error.message}`);
                // We'll continue anyway as the page might be partially loaded
            });

            // Random delay after page load (2-4 seconds)
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 2000));

            // Log current URL to help with debugging
            const currentUrl = await page.url();
            LogHelper.info(`Current page URL after navigation: ${currentUrl}`);

            // Check for CAPTCHA after navigation - handle it automatically if found
            if (await this.detectCaptcha(page)) {
                LogHelper.info('CAPTCHA detected during profile navigation. Starting CAPTCHA handling...');

                // Handle CAPTCHA with the browser window
                const { browser: newBrowser, page: newPage } = await this.handleCaptcha(page, page.browser());
                page = newPage;


                // After CAPTCHA is solved, navigate back to the profile we were trying to reach
                LogHelper.info(`CAPTCHA solved. Returning to target profile: ${targetProfileUrl}`);

                // Wait a moment before continuing
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Navigate back to the target profile
                await page.goto(targetProfileUrl, {
                    waitUntil: ['domcontentloaded'],
                    timeout: 90000
                });

                // Check if we're still seeing a CAPTCHA (rare but possible)
                if (await this.detectCaptcha(page)) {
                    LogHelper.error('Still encountering CAPTCHA after solution. This may require additional handling.');
                    throw new Error('CAPTCHA persists after solution attempt');
                }
            }

            // Try to find profile elements with retry mechanism
            let profileFound = false;
            let retryCount = 0;
            const maxRetries = 3;

            while (!profileFound && retryCount < maxRetries) {
                // Check for common profile page elements with multiple selectors
                profileFound = await page.evaluate(() => {
                    function isVisible(element) {
                        if (!element) return false;
                        const style = window.getComputedStyle(element);
                        return style &&
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            style.opacity !== '0' &&
                            element.offsetWidth > 0 &&
                            element.offsetHeight > 0;
                    }

                    // Console-based debugging - safely wrapped in try/catch
                    try {
                        console.log('Document title:', document.title);
                        console.log('URL:', window.location.href);
                        const bodyClasses = document.body.getAttribute('class') || '';
                        console.log('Body classes:', bodyClasses);
                    } catch (e) {
                        // Ignore console errors
                    }

                    const possibleSelectors = [
                        // Most reliable profile indicators
                        '[data-test-id="profile-content"]',
                        '[data-test-id="profile-card"]',
                        'div[class*="profile-content"]',
                        'div[class*="profile-card"]',
                        // Core profile sections
                        '.pv-top-card',
                        '#profile-content',
                        '.profile-content',
                        // Header elements
                        '.profile-background-image',
                        '.profile-header-container',
                        '.ph-top-card-container',
                        '.artdeco-card',
                        // Profile image elements
                        '.pv-top-card-profile-picture',
                        '.profile-photo-edit__preview',
                        '.presence-entity__image',
                        // Content containers
                        '.profile-rail',
                        '.scaffold-layout__main',
                        '.scaffold-finite-scroll',
                        // Basic elements that should be on any profile
                        'h1.text-heading-xlarge',
                        '.display-flex.pb3',
                        '.pv-text-details__left-panel',
                        // 2025 Additional Selectors (May 2025)
                        'div[class*="top-card"]',
                        'div[class*="profile-view"]',
                        'section[class*="profile"]',
                        // LinkedIn 2025 specific selectors (from screenshot)
                        'img.artdeco-entity-image',
                        'img.profile-picture',
                        '.profile-photo',
                        '.top-card-layout',
                        '.ph-avatar-container',
                        // Data attribute selectors
                        '[data-view-name="profile-component"]',
                        '[data-test-id="profile-topcard"]',
                        '[data-live-test-id="profile"]',
                        '[data-id*="profile"]',
                        // Content identifiers for 2025 LinkedIn
                        '.profile-info',
                        '.profile-section',
                        '.about-section',
                        '.experience-section',
                        '.education-section',
                        '.skill-categories-section',
                        // Minimal content checks
                        'h1', // Profile name is always in h1
                        'div[class*="background-image"]'
                    ];

                    // Try multiple methods to find profile elements
                    const hasVisibleElement = possibleSelectors.some(selector => {
                        const elements = document.querySelectorAll(selector);
                        return Array.from(elements).some(el => isVisible(el));
                    });

                    // Check for profile-specific text content
                    const pageText = document.body.innerText.toLowerCase();
                    const hasProfileContent = [
                        'experience',
                        'education',
                        'skills',
                        'about',
                        'contact info',
                        'profile',
                        'summary',
                        'recommendations',
                        'accomplishments',
                        'certifications'
                    ].some(text => pageText.includes(text));

                    // Check if we're on a profile page by URL pattern
                    const isProfileUrl = window.location.href.includes('/in/') ||
                        window.location.pathname.startsWith('/in/');

                    return hasVisibleElement || hasProfileContent || isProfileUrl;
                });

                if (!profileFound) {
                    // Check if we're on an error page
                    const hasError = await page.evaluate(() => {
                        const errorSelectors = [
                            '.error-container',
                            '.profile-unavailable',
                            '.profile-not-found',
                            '[data-test-id="error-container"]',
                            '#error-page',
                            '.error-404',
                            '.not-found'
                        ];
                        return errorSelectors.some(selector => document.querySelector(selector) !== null);
                    });

                    if (hasError) {
                        const errorText = await page.evaluate(() => document.body.innerText);
                        LogHelper.error(`Profile page error detected: ${errorText.substring(0, 200)}...`);
                        throw new Error('Profile not found or unavailable');
                    }

                    // If not found and no error, maybe the page is still loading
                    retryCount++;
                    LogHelper.info(`Profile elements not found, retry ${retryCount}/${maxRetries}`);

                    // Check for CAPTCHA again during retries
                    if (await this.detectCaptcha(page)) {
                        LogHelper.info('CAPTCHA detected during profile detection, handling...');
                        const { browser: newBrowser, page: newPage } = await this.handleCaptcha(page, page.browser());
                        page = newPage;

                        // Navigate back to target URL
                        await page.goto(targetProfileUrl, {
                            waitUntil: ['domcontentloaded'],
                            timeout: 60000
                        });
                    } else {
                        // Wait before next retry if no CAPTCHA
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }

            if (!profileFound) {
                throw new Error('Failed to detect profile content after multiple attempts');
            }

            // Execute minimal scrolling to load content in the background
            await this.scrollProfile(page);

            // Take a screenshot of the profile
            LogHelper.info('Profile found! Taking screenshot...');

            // Generate a unique filename for the screenshot
            const timestamp = Date.now();
            const screenshotPath = `${process.cwd()}/screenshots/profile-${timestamp}.png`;

            // Take full page screenshot
            await page.screenshot({
                path: screenshotPath,
                fullPage: true
            });

            LogHelper.info(`Screenshot saved: ${screenshotPath}`);

            return {
                success: true,
                screenshotPath,
                page
            };

        } catch (error) {
            LogHelper.error(`Profile navigation error: ${error.message}`);

            // Save debug screenshot on error
            try {
                const timestamp = Date.now();
                const errorScreenshotPath = `${process.cwd()}/debug/profile-error-${timestamp}.png`;
                await page.screenshot({ path: errorScreenshotPath, fullPage: true });
                LogHelper.info(`Error screenshot saved: ${errorScreenshotPath}`);
            } catch (screenshotError) {
                LogHelper.error('Failed to save error screenshot:', screenshotError);
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    static async fillLoginForm(page) {
        try {
            const email = process.env.LINKEDIN_EMAIL;
            const password = process.env.LINKEDIN_PASSWORD;

            if (!email || !password) {
                throw new Error('LinkedIn credentials not found in environment variables');
            }

            LogHelper.info('Filling login form...');

            // Type email with human-like delays
            await page.waitForSelector('input[name="session_key"]', { visible: true });
            await page.type('input[name="session_key"]', email, { delay: 100 });

            // Type password with human-like delays
            await page.waitForSelector('input[name="session_password"]', { visible: true });
            await page.type('input[name="session_password"]', password, { delay: 100 });

            return true;
        } catch (error) {
            LogHelper.error('Error filling login form:', error);
            throw error;
        }
    }

    static async scrollProfile(page) {
        try {
            LogHelper.info('Loading profile content in background mode...');

            // First wait for page to be stable
            await page.waitForFunction(() => document.readyState === 'complete', {
                timeout: 10000
            }).catch(() => {
                LogHelper.info('Page not fully loaded, continuing anyway...');
            });

            // Quick expand sections function - try to expand "See more" links
            await this.expandAllSections(page);

            // Simple and efficient scroll to load content
            await page.evaluate(async () => {
                // Helper function to pause
                const pause = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

                // Get the document height
                const documentHeight = document.body.scrollHeight;

                // Scroll in larger chunks for efficiency
                const scrollStep = 800;

                for (let i = 0; i < documentHeight; i += scrollStep) {
                    window.scrollTo(0, i);
                    await pause(300); // Brief pause to let content load
                }

                // Return to top
                window.scrollTo(0, 0);
            });

            // One last attempt to expand any sections that might have loaded
            await this.expandAllSections(page);

            // Make sure we're fully loaded
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            LogHelper.error('Error during background content loading:', error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Expand all "See more" buttons and sections in the profile
     * Optimized for background/headless operation
     */
    static async expandAllSections(page) {
        try {
            LogHelper.info('Expanding profile sections in background mode...');

            // Use a more efficient approach for headless operation
            await page.evaluate(async () => {
                // List of possible selectors for "See more" buttons
                const expandButtons = [

                    // Skills section specific buttons (2023-2025)
                    'button.pv-skills-section__additional-skills',
                    'button[aria-label="Show all skills"]',
                    'button[aria-label="Show more skills"]',
                    'button[data-control-name="skill_details"]',
                    'button.artdeco-button[aria-controls*="skill"]',

                    // Experience and Education expansion buttons
                    'button[aria-label="Show more experience"]',
                    'button[aria-label="Show more education"]',
                    'button[aria-controls*="education-section"]',
                    'button[aria-controls*="experience-section"]',

                ];

                // Helper function for minimal delays
                const minimalDelay = () => new Promise(r => setTimeout(r, 100));

                // Function to handle clicks with better error handling
                const safeClick = async (element) => {
                    if (!element || typeof element.click !== 'function' || element.offsetParent === null) {
                        return false;
                    }

                    try {
                        // Log before clicking for debugging
                        console.log(`Clicking element: ${element.tagName} | Text: ${element.textContent.trim().substring(0, 30)}`);

                        // Simple click without animations
                        element.click();
                        await minimalDelay();
                        return true;
                    } catch (e) {
                        // Silently continue
                        return false;
                    }
                };

                // Try to click on expand buttons efficiently
                for (const selector of expandButtons) {
                    try {
                        const buttons = document.querySelectorAll(selector);
                        if (buttons.length > 0) {
                            console.log(`Found ${buttons.length} expand buttons with selector: ${selector}`);
                            for (const button of buttons) {
                                await safeClick(button);
                            }
                        }
                    } catch (err) {
                        console.log(`Error with selector ${selector}: ${err.message}`);
                    }
                }

                // Wait a bit for content to update
                await new Promise(r => setTimeout(r, 500));

                // Additional pass specifically for skills section
                const skillsContainers = [
                    '.pv-skills-section',
                    '.skills-section',
                    'section[aria-label*="skill"]',
                    'section[id*="skill"]',
                    '.profile-section[id*="skill"]'
                ];

                for (const container of skillsContainers) {
                    const skillsSection = document.querySelector(container);
                    if (skillsSection) {
                        console.log(`Found skills section with selector: ${container}`);
                        // Find any buttons inside this section
                        const skillButtons = skillsSection.querySelectorAll('button');
                        for (const button of skillButtons) {
                            await safeClick(button);
                        }
                    }
                }

                // Text-based expander pass for any buttons with relevant text
                const textBasedExpanders = Array.from(document.querySelectorAll('button, a[role="button"]'))
                    .filter(el => {
                        if (!el || !el.textContent) return false;

                        const text = el.textContent.toLowerCase().trim();
                        return (text.includes('see more') ||
                            text.includes('show more') ||
                            text.includes('show all') ||
                            text.includes('view all') ||
                            text.includes('view more') ||
                            text.includes('expand') ||
                            text.includes('show additional skills') ||
                            text === 'more' ||
                            text.match(/show \d+ skills/)) &&
                            !el.disabled;
                    });

                console.log(`Found ${textBasedExpanders.length} text-based expanders`);

                for (const expander of textBasedExpanders) {
                    await safeClick(expander);
                }

                // One final pass for specific text content for skills
                const skillsTextExpanders = Array.from(document.querySelectorAll('button, a[role="button"]'))
                    .filter(el => {
                        if (!el || !el.textContent) return false;
                        const text = el.textContent.toLowerCase().trim();
                        return text.includes('skill') &&
                            (text.includes('show') || text.includes('see') || text.includes('more') || text.includes('all'));
                    });

                console.log(`Found ${skillsTextExpanders.length} skills-specific expanders`);

                for (const skillExpander of skillsTextExpanders) {
                    await safeClick(skillExpander);
                }

            }).catch(err => {
                LogHelper.info(`Non-critical error expanding sections: ${err.message}`);
            });

            // Give a bit more time for skill sections to fully expand
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Try a second pass specifically for skills sections that might have loaded after first pass
            await page.evaluate(async () => {
                const minimalDelay = () => new Promise(r => setTimeout(r, 100));

                // Only target skills-related buttons in second pass
                const skillsButtons = Array.from(document.querySelectorAll('button, a[role="button"]'))
                    .filter(el => {
                        if (!el || !el.textContent || !el.offsetParent) return false;
                        const text = el.textContent.toLowerCase().trim();
                        return text.includes('skill') && !el.disabled;
                    });

                console.log(`Second pass: Found ${skillsButtons.length} skills buttons`);

                for (const button of skillsButtons) {
                    try {
                        button.click();
                        await minimalDelay();
                    } catch (e) {
                        // Silently continue
                    }
                }
            }).catch(err => {
                LogHelper.info(`Non-critical error in second pass: ${err.message}`);
            });

            // Brief wait for any lazy-loaded content
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            LogHelper.error('Error expanding sections:', error);
            // Don't throw - this is not critical
        }
    }

    static async waitForDOMStability(page, checks = 3, interval = 800) {
        let lastHTMLSize = 0;
        let stableCount = 0;
        for (let i = 0; i < checks * 5; i++) {
            const html = await page.content();
            const currentHTMLSize = html.length;
            if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
                stableCount++;
            } else {
                stableCount = 0;
            }
            if (stableCount >= checks) {
                return true;
            }
            lastHTMLSize = currentHTMLSize;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        LogHelper.info('DOM did not stabilize after waiting, continuing anyway...');
        return false;
    }
}

module.exports = LinkedinService;