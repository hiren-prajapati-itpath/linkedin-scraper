// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// const randomUseragent = require('random-useragent');
// const LogHelper = require('./logHelper');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require('random-useragent');
const LogHelper = require('./logHelper');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

class BrowserHelper {
    static async verifyBrowserSetup() {
        try {
            LogHelper.info('Verifying browser setup...');
            // Default Chrome paths for different operating systems
            let chromePath;
            if (process.platform === 'win32') {
                // Windows path
                chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
                // Alternative paths if the above doesn't exist
                if (!require('fs').existsSync(chromePath)) {
                    const altPaths = [
                        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
                    ];
                    for (const path of altPaths) {
                        if (require('fs').existsSync(path)) {
                            chromePath = path;
                            break;
                        }
                    }
                }
            } else if (process.platform === 'darwin') {
                // MacOS path
                chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            } else {
                // Linux path
                chromePath = '/usr/bin/google-chrome';
            }

            LogHelper.info(`Using Chrome at path: ${chromePath}`);

            const browser = await puppeteer.launch({
                headless: true,
                executablePath: chromePath,  // Use platform-specific Chrome path
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.goto('about:blank');

            // Get browser version
            const version = await browser.version();
            LogHelper.info(`Browser version: ${version}`);

            await browser.close();
            LogHelper.info('Browser setup verified successfully ✅');
            return true;
        } catch (error) {
            LogHelper.error('Browser setup verification failed:', error);
            return false;
        }
    }


    static async createPage(browser) {
        try {
            const page = await browser.newPage();

            // Add custom request interception with GraphQL handling
            await page.setRequestInterception(true);

            page.on('request', async request => {
                const url = request.url().toLowerCase();
                const resourceType = request.resourceType();
                const headers = request.headers();

                // Always ensure we're sending proper referrer and origin headers for LinkedIn requests
                // This helps avoid GraphQL errors
                if (url.includes('linkedin.com')) {
                    const newHeaders = {
                        ...headers,
                        'Referer': 'https://www.linkedin.com/',
                        'Origin': 'https://www.linkedin.com',
                        'Accept': 'application/vnd.linkedin.normalized+json+2.1',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'same-origin',
                        'Connection': 'keep-alive',
                    };

                    // For GraphQL endpoints, add specific headers to avoid detection
                    if (url.includes('/voyager/api')) {
                        newHeaders['x-li-page-instance'] = 'urn:li:page:d_flagship3_profile_view_base;' + Math.random().toString(36).substring(2, 15);
                        newHeaders['x-restli-protocol-version'] = '2.0.0';
                        newHeaders['csrf-token'] = headers['x-csrf-token'] || headers['csrf-token'] || 'ajax:' + Math.random().toString(36).substring(2, 15);
                    }

                    request.continue({ headers: newHeaders });
                    return;
                }

                // Allow LinkedIn resources and essential types
                if (url.includes('linkedin.com') ||
                    url.includes('licdn.com') ||
                    url.includes('merchantpool') || // Allow tracking scripts that we've patched
                    url.includes('amazonaws.com') || // Allow AWS resources used by LinkedIn
                    url.includes('cloudfront.net') || // Allow CloudFront CDN for LinkedIn
                    url.includes('s3.amazonaws.com') || // Allow S3 resources
                    url.includes('google') || // Allow all Google resources for CAPTCHA
                    url.includes('gstatic') || // Allow gstatic content for CAPTCHA
                    url.includes('recaptcha') || // Allow reCAPTCHA scripts
                    url.includes('captcha') || // Allow any captcha resources
                    url.includes('challenge') || // Allow challenge resources
                    url.includes('security') || // Allow security verification resources
                    url.includes('checkpoint') || // Allow checkpoint resources
                    url.includes('verification') || // Allow verification resources
                    resourceType === 'script' ||
                    resourceType === 'xhr' ||
                    resourceType === 'fetch' ||
                    resourceType === 'document' ||
                    resourceType === 'stylesheet' ||  // Allow CSS
                    resourceType === 'other' ||       // Allow other resources that might be needed
                    resourceType === 'websocket') {   // Allow websockets for real-time communication
                    request.continue();
                }
                // Only block non-essential media and fonts
                else if (['image', 'media', 'font'].includes(resourceType) &&
                    !url.includes('profile-displayphoto') && // Allow profile photos
                    !url.includes('captcha') && // Always allow CAPTCHA resources
                    !url.includes('recaptcha') && // Always allow reCAPTCHA
                    !url.includes('challenge') && // Allow challenge images
                    !url.includes('verification')) { // Allow verification images
                    request.abort();
                } else {
                    request.continue();
                }
            });

            // Set up viewport and headers
            await page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
                hasTouch: false,
                isLandscape: true,
                isMobile: false
            });

            // Use high-quality headers with proper Accept-Language and Accept headers
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'sec-ch-ua': '"Google Chrome";v="113", "Chromium";v="113", "Not-A.Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            });

            // Quiet common automation-detection errors
            const ignorePatterns = [
                'Notification',
                'Illegal invocation',
                'Cannot assign to read only property',
                'Cannot read properties of undefined',
                '_initMicrosoftAuth',
                'MD5Hash',
                'merchantpool',
                'licdn.com',
                'window.pilot',
                'This request has been blocked', // CORS errors
                'Failed to load resource',
                'blob:https://', // LinkedIn blob errors
                'd2d1hqaoo12243.cloudfront.net', // LinkedIn CDN
                'chrome-extension',
                'chrome.loadTimes',
                'userAgentMetadata',
                'LinkedInDependencies', // Common LinkedIn script errors
                'gsi/client', // Google sign-in
                'Network Error', // Common network errors
                'recaptcha' // CAPTCHA-related errors
            ];

            page.on('error', error => {
                if (!ignorePatterns.some(pattern => error.message.includes(pattern))) {
                    LogHelper.error('Page error:', error);
                }
            });

            page.on('pageerror', error => {
                if (!ignorePatterns.some(pattern => error.message.includes(pattern))) {
                    LogHelper.error('Page error:', error);
                }
            });

            // Setup console message handling
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();

                // Filter out common noisy errors that don't affect functionality
                if (type === 'error' && !ignorePatterns.some(pattern => text.includes(pattern))) {
                    LogHelper.info(`Console ${type}: ${text}`);
                }
            });

            // Add stealth scripts
            await page.evaluateOnNewDocument(() => {
                // Add full AMD (Require.js) support
                const define = function (name, deps, callback) {
                    if (typeof name !== 'string') {
                        callback = deps;
                        deps = name;
                        name = null;
                    }
                    if (!Array.isArray(deps)) {
                        callback = deps;
                        deps = [];
                    }
                    try {
                        callback.apply(null, deps.map(() => ({})));
                    } catch (e) { }
                };
                define.amd = true;
                define.alias = function () { return define; };
                window.define = define;
                window.requirejs = window.require = function (deps, callback) {
                    return callback ? callback.apply(null, deps.map(() => ({}))) : {};
                };

                // Overwrite the navigator prototype
                const newProto = navigator.__proto__;
                delete newProto.webdriver;
                navigator.__proto__ = newProto;

                // Add language and plugins
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en-GB', 'en']
                });

                Object.defineProperty(navigator, 'plugins', {
                    get: () => {
                        const plugins = [
                            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                            { name: 'Native Client', filename: 'internal-nacl-plugin' }
                        ];
                        plugins.item = (index) => plugins[index];
                        plugins.namedItem = (name) => plugins.find(p => p.name === name);
                        return plugins;
                    }
                });

                // Mock notifications
                window.Notification = {
                    permission: 'default',
                    requestPermission: () => Promise.resolve('default')
                };

                // Mock permissions
                if (navigator.permissions) {
                    navigator.permissions.query = (params) =>
                        Promise.resolve({
                            state: params.name === 'notifications' ? 'prompt' : 'granted',
                            onchange: null
                        });
                }

                // Add MD5Hash implementation to fix "window.MD5Hash is not a function" error
                window.MD5Hash = function (input) {
                    function md5cycle(x, k) {
                        let a = x[0], b = x[1], c = x[2], d = x[3];

                        a = ff(a, b, c, d, k[0], 7, -680876936);
                        d = ff(d, a, b, c, k[1], 12, -389564586);
                        c = ff(c, d, a, b, k[2], 17, 606105819);
                        b = ff(b, c, d, a, k[3], 22, -1044525330);

                        a = ff(a, b, c, d, k[4], 7, -176418897);
                        d = ff(d, a, b, c, k[5], 12, 1200080426);
                        c = ff(c, d, a, b, k[6], 17, -1473231341);
                        b = ff(b, c, d, a, k[7], 22, -45705983);

                        a = ff(a, b, c, d, k[8], 7, 1770035416);
                        d = ff(d, a, b, c, k[9], 12, -1958414417);
                        c = ff(c, d, a, b, k[10], 17, -42063);
                        b = ff(b, c, d, a, k[11], 22, -1990404162);

                        a = ff(a, b, c, d, k[12], 7, 1804603682);
                        d = ff(d, a, b, c, k[13], 12, -40341101);
                        c = ff(c, d, a, b, k[14], 17, -1502002290);
                        b = ff(b, c, d, a, k[15], 22, 1236535329);

                        a = gg(a, b, c, d, k[1], 5, -165796510);
                        d = gg(d, a, b, c, k[6], 9, -1069501632);
                        c = gg(c, d, a, b, k[11], 14, 643717713);
                        b = gg(b, c, d, a, k[0], 20, -373897302);

                        a = gg(a, b, c, d, k[5], 5, -701558691);
                        d = gg(d, a, b, c, k[10], 9, 38016083);
                        c = gg(c, d, a, b, k[15], 14, -660478335);
                        b = gg(b, c, d, a, k[4], 20, -405537848);

                        a = gg(a, b, c, d, k[9], 5, 568446438);
                        d = gg(d, a, b, c, k[14], 9, -1019803690);
                        c = gg(c, d, a, b, k[3], 14, -187363961);
                        b = gg(b, c, d, a, k[8], 20, 1163531501);

                        a = gg(a, b, c, d, k[13], 5, -1444681467);
                        d = gg(d, a, b, c, k[2], 9, -51403784);
                        c = gg(c, d, a, b, k[7], 14, 1735328473);
                        b = gg(b, c, d, a, k[12], 20, -1926607734);

                        a = hh(a, b, c, d, k[5], 4, -378558);
                        d = hh(d, a, b, c, k[8], 11, -2022574463);
                        c = hh(c, d, a, b, k[11], 16, 1839030562);
                        b = hh(b, c, d, a, k[14], 23, -35309556);

                        a = hh(a, b, c, d, k[1], 4, -1530992060);
                        d = hh(d, a, b, c, k[4], 11, 1272893353);
                        c = hh(c, d, a, b, k[7], 16, -155497632);
                        b = hh(b, c, d, a, k[10], 23, -1094730640);

                        a = hh(a, b, c, d, k[13], 4, 681279174);
                        d = hh(d, a, b, c, k[0], 11, -358537222);
                        c = hh(c, d, a, b, k[3], 16, -722521979);
                        b = hh(b, c, d, a, k[6], 23, 76029189);

                        a = hh(a, b, c, d, k[9], 4, -640364487);
                        d = hh(d, a, b, c, k[12], 11, -421815835);
                        c = hh(c, d, a, b, k[15], 16, 530742520);
                        b = hh(b, c, d, a, k[2], 23, -995338651);

                        a = ii(a, b, c, d, k[0], 6, -198630844);
                        d = ii(d, a, b, c, k[7], 10, 1126891415);
                        c = ii(c, d, a, b, k[14], 15, -1416354905);
                        b = ii(b, c, d, a, k[5], 21, -57434055);

                        a = ii(a, b, c, d, k[12], 6, 1700485571);
                        d = ii(d, a, b, c, k[3], 10, -1894986606);
                        c = ii(c, d, a, b, k[10], 15, -1051523);
                        b = ii(b, c, d, a, k[1], 21, -2054922799);

                        a = ii(a, b, c, d, k[8], 6, 1873313359);
                        d = ii(d, a, b, c, k[15], 10, -30611744);
                        c = ii(c, d, a, b, k[6], 15, -1560198380);
                        b = ii(b, c, d, a, k[13], 21, 1309151649);

                        a = ii(a, b, c, d, k[4], 6, -145523070);
                        d = ii(d, a, b, c, k[11], 10, -1120210379);
                        c = ii(c, d, a, b, k[2], 15, 718787259);
                        b = ii(b, c, d, a, k[9], 21, -343485551);

                        x[0] = add32(a, x[0]);
                        x[1] = add32(b, x[1]);
                        x[2] = add32(c, x[2]);
                        x[3] = add32(d, x[3]);
                    }

                    function cmn(q, a, b, x, s, t) {
                        a = add32(add32(a, q), add32(x, t));
                        return add32((a << s) | (a >>> (32 - s)), b);
                    }

                    function ff(a, b, c, d, x, s, t) {
                        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
                    }

                    function gg(a, b, c, d, x, s, t) {
                        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
                    }

                    function hh(a, b, c, d, x, s, t) {
                        return cmn(b ^ c ^ d, a, b, x, s, t);
                    }

                    function ii(a, b, c, d, x, s, t) {
                        return cmn(c ^ (b | (~d)), a, b, x, s, t);
                    }

                    function md51(s) {
                        const n = s.length,
                            state = [1732584193, -271733879, -1732584194, 271733878];
                        let i;

                        for (i = 64; i <= s.length; i += 64) {
                            md5cycle(state, md5blk(s.substring(i - 64, i)));
                        }

                        s = s.substring(i - 64);
                        const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

                        for (i = 0; i < s.length; i++) {
                            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
                        }

                        tail[i >> 2] |= 0x80 << ((i % 4) << 3);

                        if (i > 55) {
                            md5cycle(state, tail);
                            for (i = 0; i < 16; i++) tail[i] = 0;
                        }

                        tail[14] = n * 8;
                        md5cycle(state, tail);
                        return state;
                    }

                    function md5blk(s) {
                        const md5blks = [];
                        for (let i = 0; i < 64; i += 4) {
                            md5blks[i >> 2] = s.charCodeAt(i) +
                                (s.charCodeAt(i + 1) << 8) +
                                (s.charCodeAt(i + 2) << 16) +
                                (s.charCodeAt(i + 3) << 24);
                        }
                        return md5blks;
                    }

                    const hex_chr = '0123456789abcdef'.split('');

                    function rhex(n) {
                        let s = '', j = 0;
                        for (; j < 4; j++) {
                            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] +
                                hex_chr[(n >> (j * 8)) & 0x0F];
                        }
                        return s;
                    }

                    function hex(x) {
                        for (let i = 0; i < x.length; i++) {
                            x[i] = rhex(x[i]);
                        }
                        return x.join('');
                    }

                    function add32(a, b) {
                        return (a + b) & 0xFFFFFFFF;
                    }

                    if (input === undefined) {
                        return '00000000000000000000000000000000';
                    }

                    return hex(md51(input));
                };

                // Add Chrome runtime
                window.chrome = {
                    runtime: {}
                };

                // Prevent modal dialogs
                window.alert = window.confirm = window.prompt = () => { };
            });

            return page;
        } catch (error) {
            LogHelper.error('Failed to create page:', error);
            throw error;
        }
    }

    static async initBrowser(forceNonHeadless = false) {
        try {
            LogHelper.info(`Initializing browser in ${forceNonHeadless ? 'visible' : 'background'} mode...`);

            // Use a premium user agent from a real browser session
            // Using a high-quality, recent Chrome on Windows UA reduces detection probability
            const premiumUserAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            ];

            // Select a random premium user agent
            const randomUseragentString = premiumUserAgents[Math.floor(Math.random() * premiumUserAgents.length)];

            // Default Chrome paths for different operating systems
            let chromePath;
            if (process.platform === 'win32') {
                // Windows path
                chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
                // Alternative paths if the above doesn't exist
                if (!require('fs').existsSync(chromePath)) {
                    const altPaths = [
                        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
                    ];
                    for (const path of altPaths) {
                        if (require('fs').existsSync(path)) {
                            chromePath = path;
                            break;
                        }
                    }
                }
            } else if (process.platform === 'darwin') {
                // MacOS path
                chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            } else {
                // Linux path
                chromePath = '/usr/bin/google-chrome';
            }

            LogHelper.info(`Using Chrome at path: ${chromePath}`);
            LogHelper.info(`Using user agent: ${randomUseragentString}`);

            // Generate a random viewport size that looks like a real desktop
            const viewportWidth = 1200 + Math.floor(Math.random() * 700); // Between 1200-1900
            const viewportHeight = 800 + Math.floor(Math.random() * 400); // Between 800-1200

            // Create a unique but persistent session directory for cookies and storage
            const sessionId = process.env.SESSION_ID || 'linkedin-session';
            const userDataDir = path.join(__dirname, '../../user_data', sessionId);

            // Ensure the user data directory exists
            if (!require('fs').existsSync(userDataDir)) {
                require('fs').mkdirSync(userDataDir, { recursive: true });
            }

            const launchOptions = {
                headless: forceNonHeadless ? false : true,  // Run in background unless CAPTCHA handling needed
                executablePath: chromePath,
                userDataDir: userDataDir, // Use persistent session data
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
                    '--disable-blink-features=AutomationControlled', // Critical for avoiding detection
                    `--window-size=${viewportWidth},${viewportHeight}`,
                    '--start-maximized',
                    `--user-agent=${randomUseragentString}`,
                    '--disable-infobars',
                    '--lang=en-US,en;q=0.9',
                    '--disable-notifications',
                    '--disable-popup-blocking',
                    '--disable-translate',
                    // Removed '--disable-extensions' to look more like a real browser
                    // These arguments help evade detection
                    '--disable-blink-features=AutomationControlled',
                    '--disable-automation',
                    '--disable-site-isolation-trials'
                ],
                ignoreHTTPSErrors: true,
                ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'], // Critical for avoiding detection
                defaultViewport: null // Match browser window size, important for CAPTCHAs
            };

            const browser = await puppeteer.launch(launchOptions);

            // Modify the browser window properties to avoid fingerprinting
            const page = await browser.newPage();

            // Add additional scripts to avoid fingerprinting
            await page.evaluateOnNewDocument(() => {
                // Overwrite the navigator properties
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });

                // Overwrite chrome runtime
                if (window.chrome) {
                    window.chrome.runtime = {};
                }

                // Add language plugins that real browsers have
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en', 'es']
                });

                // Add hardware concurrency like a real device
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => 8
                });

                // Add plugins array with realistic plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => {
                        return [1, 2, 3, 4, 5].map(() => ({
                            name: [
                                'Chrome PDF Plugin',
                                'Chrome PDF Viewer',
                                'Native Client',
                                'Widevine Content Decryption Module',
                                'Microsoft Office',
                                'Adobe Acrobat'
                            ][Math.floor(Math.random() * 6)]
                        }));
                    }
                });

                // Add media devices to look like real browser
                if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
                    navigator.mediaDevices.enumerateDevices = async () => {
                        const originalDevices = await originalEnumerateDevices();
                        if (originalDevices && originalDevices.length > 0) {
                            return originalDevices;
                        }

                        // Return fake media devices if none detected
                        return [
                            { kind: 'audioinput', deviceId: 'default', label: 'Default - Internal Microphone', groupId: 'audio1' },
                            { kind: 'audiooutput', deviceId: 'default', label: 'Default - Internal Speakers', groupId: 'audio2' },
                            { kind: 'videoinput', deviceId: 'default', label: 'Internal Webcam', groupId: 'video1' }
                        ];
                    };
                }
            });

            // Use the enhanced page creation function
            const enhancedPage = await this.createPage(browser);
            await enhancedPage.close(); // Close the initial page

            return { browser, page };
        } catch (error) {
            LogHelper.error('Failed to initialize browser:', error);
            throw error;
        }
    }

    static async createVisiblePage(browser, cookies = null) {
        try {
            const page = await this.createPage(browser);

            if (cookies) {
                await page.setCookie(...cookies);
            }

            return page;
        } catch (error) {
            LogHelper.error('Failed to create visible page:', error);
            throw error;
        }
    }

    static async closeBrowser(browser) {
        if (browser) {
            try {
                await browser.close();
                LogHelper.info('Browser closed successfully');
            } catch (error) {
                LogHelper.error('Error closing browser:', error);
            }
        }
    }

    static async switchToVisibleMode(browser, page) {
        try {
            LogHelper.info('Switching to visible mode for CAPTCHA handling...');

            // Store current URL before closing
            const currentUrl = await page.url();
            LogHelper.info(`Current URL before switch: ${currentUrl}`);

            // Get all cookies
            const cookies = await page.cookies();

            // Get session storage and local storage data
            const sessionStorage = await page.evaluate(() => {
                const data = {};
                try {
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        data[key] = sessionStorage.getItem(key);
                    }
                } catch (e) {
                    console.log('Error accessing sessionStorage:', e);
                }
                return data;
            }).catch(() => ({}));

            const localStorage = await page.evaluate(() => {
                const data = {};
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        data[key] = localStorage.getItem(key);
                    }
                } catch (e) {
                    console.log('Error accessing localStorage:', e);
                }
                return data;
            }).catch(() => ({}));

            // Close the current browser and page safely
            try {
                if (page && !page.isClosed()) await page.close();
                if (browser) await browser.close();
            } catch (e) {
                LogHelper.info(`Error closing browser/page: ${e.message}`);
            }

            // Determine Chrome path based on platform
            let chromePath;
            if (process.platform === 'win32') {
                // Windows path
                chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
                // Alternative paths if the above doesn't exist
                if (!require('fs').existsSync(chromePath)) {
                    const altPaths = [
                        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
                    ];
                    for (const path of altPaths) {
                        if (require('fs').existsSync(path)) {
                            chromePath = path;
                            break;
                        }
                    }
                }
            } else if (process.platform === 'darwin') {
                // MacOS path
                chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            } else {
                // Linux path
                chromePath = '/usr/bin/google-chrome';
            }

            // Launch new browser in non-headless mode with enhanced anti-detection
            const newBrowser = await puppeteer.launch({
                headless: false,
                executablePath: chromePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',  // Disable CORS
                    '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
                    '--disable-blink-features=AutomationControlled', // Key for anti-bot detection
                    '--window-size=1920,1080',
                    '--start-maximized',
                    '--disable-infobars',
                    '--lang=en-US,en',
                    '--disable-notifications',
                    '--disable-popup-blocking',
                    '--disable-extensions',
                    '--disable-translate',
                    '--disable-background-mode'
                ],
                defaultViewport: null, // Disables the fixed viewport to match window size
                ignoreDefaultArgs: ['--enable-automation'] // Very important for anti-detection
            });

            // Create and set up new page
            const newPage = await this.createPage(newBrowser);

            // Add user agent spoofing
            await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

            // Restore cookies if available
            if (cookies.length > 0) {
                await newPage.setCookie(...cookies);
            }

            // Restore session storage and local storage
            await newPage.evaluate((sessionData, localData) => {
                // Restore session storage
                for (const key in sessionData) {
                    try {
                        window.sessionStorage.setItem(key, sessionData[key]);
                    } catch (e) {
                        console.log('Error restoring session storage item:', e);
                    }
                }

                // Restore local storage
                for (const key in localData) {
                    try {
                        window.localStorage.setItem(key, localData[key]);
                    } catch (e) {
                        console.log('Error restoring local storage item:', e);
                    }
                }
            }, sessionStorage, localStorage).catch(e => {
                LogHelper.info(`Non-critical error restoring storage: ${e.message}`);
            });

            // Navigate to the stored URL
            LogHelper.info(`Navigating to stored URL: ${currentUrl}`);
            await newPage.goto(currentUrl, {
                waitUntil: 'networkidle2',
                timeout: 90000 // Longer timeout for potentially slow loading CAPTCHA pages
            });

            // Maximize the window to make CAPTCHA solving easier
            const session = await newBrowser.target().createCDPSession();
            await session.send('Browser.setWindowBounds', {
                windowId: 1,
                bounds: { windowState: 'maximized' }
            }).catch(() => {
                // Fallback if the CDP method fails
                newPage.evaluate(() => {
                    window.moveTo(0, 0);
                    window.resizeTo(screen.width, screen.height);
                });
            });

            return { browser: newBrowser, page: newPage };
        } catch (error) {
            LogHelper.error('Failed to switch to visible mode:', error);
            throw error;
        }
    }

    static async switchToHeadlessMode(browser, page) {
        try {
            LogHelper.info('CAPTCHA solved - switching back to headless mode...');

            // Store current URL before closing
            const currentUrl = await page.url();
            LogHelper.info(`Current URL before switch: ${currentUrl}`);

            // Get all cookies
            const cookies = await page.cookies();

            // Get session storage and local storage data
            const sessionStorage = await page.evaluate(() => {
                const data = {};
                try {
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        data[key] = sessionStorage.getItem(key);
                    }
                } catch (e) {
                    console.log('Error accessing sessionStorage:', e);
                }
                return data;
            }).catch(() => ({}));

            const localStorage = await page.evaluate(() => {
                const data = {};
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        data[key] = localStorage.getItem(key);
                    }
                } catch (e) {
                    console.log('Error accessing localStorage:', e);
                }
                return data;
            }).catch(() => ({}));

            // Close the current visible browser and page
            try {
                if (page && !page.isClosed()) await page.close();
                if (browser) await browser.close();
            } catch (e) {
                LogHelper.info(`Error closing browser/page: ${e.message}`);
            }

            // Launch a new headless browser (forced headless mode)
            const { browser: newBrowser, page: newPage } = await this.initBrowser(false); // Force headless mode

            // Restore cookies
            if (cookies.length > 0) {
                await newPage.setCookie(...cookies);
            }

            // Restore session storage and local storage
            await newPage.evaluate((sessionData, localData) => {
                // Restore session storage
                for (const key in sessionData) {
                    try {
                        window.sessionStorage.setItem(key, sessionData[key]);
                    } catch (e) {
                        console.log('Error restoring session storage item:', e);
                    }
                }

                // Restore local storage
                for (const key in localData) {
                    try {
                        window.localStorage.setItem(key, localData[key]);
                    } catch (e) {
                        console.log('Error restoring local storage item:', e);
                    }
                }
            }, sessionStorage, localStorage).catch(e => {
                LogHelper.info(`Non-critical error restoring storage: ${e.message}`);
            });

            // Navigate back to the current URL
            await newPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            LogHelper.info('Successfully switched back to headless mode');
            return { browser: newBrowser, page: newPage };
        } catch (error) {
            LogHelper.error('Error switching back to headless mode:', error);
            throw error;
        }
    }
}

module.exports = BrowserHelper;

