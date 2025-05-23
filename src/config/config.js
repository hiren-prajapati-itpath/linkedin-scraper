require('dotenv').config();
const path = require('path');

const config = {
    // Browser Configuration
    HEADLESS: false, // Set to true for production
    USER_DATA_DIR: path.join(__dirname, '../../user_data'),
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',

    // Chrome executable paths (platform specific)
    CHROME_PATHS: {
        win32: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        ],
        darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
        linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser']
    },

    // Directory Configuration
    SCREENSHOTS_DIR: path.join(__dirname, '../../screenshots'),
    DEBUG_DIR: path.join(__dirname, '../../debug'),
    SESSIONS_DIR: path.join(__dirname, '../../sessions'),

    // Browser Viewport
    VIEWPORT: {
        width: 1280,
        height: 900
    },

    // LinkedIn Configuration
    LOGIN_URL: 'https://www.linkedin.com/login',
    BASE_URL: 'https://www.linkedin.com',

    // Timeouts (in milliseconds)
    DEFAULT_TIMEOUT: 30000,
    NAVIGATION_TIMEOUT: 60000,
    PAGE_LOAD_WAIT: 5000,

    // Browser Launch Arguments
    BROWSER_ARGS: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
    ],    // Screenshot Configuration
    SCREENSHOT_OPTIONS: {
        fullPage: true,
        type: 'png'  // Using PNG format which doesn't support quality parameter
    },

    // Rate limiting configuration
    RATE_LIMITING: {
        PROFILE_REQUEST_DELAY_MS: 72000 // 2 minutes delay between profile requests
    }
};

module.exports = config;