# LinkedIn Profile Scraper

A robust tool for scraping LinkedIn profiles with automated login and CAPTCHA handling.

## Features

- Headful (visible) browser mode for easy monitoring
- Automated login to LinkedIn
- Detection and handling of CAPTCHA and security challenges
- Smooth, human-like scrolling to load profile content
- Screenshot capture of LinkedIn profiles
- Detailed logging for debugging

## Prerequisites

- Node.js (v14 or higher)
- Google Chrome installed
- LinkedIn account credentials

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

4. Edit the `.env` file with your LinkedIn credentials and other settings.

## Usage

### Basic Usage

To scrape a LinkedIn profile:

```bash
npm run scrape-profile -- --url=https://www.linkedin.com/in/username
```

Replace `username` with the LinkedIn profile username you want to scrape.

### Command Line Options

- `--url=<profile_url>`: Specify the LinkedIn profile URL to scrape
- `--headless`: Run in headless mode (no visible browser)

### CAPTCHA Handling

If a CAPTCHA is detected during the scraping process:

1. The script will automatically open the CAPTCHA in a visible browser window
2. You will be notified in the console
3. Solve the CAPTCHA manually in the browser
4. The script will automatically continue once the CAPTCHA is solved

## Project Structure

```
linkedin-scraper/
├── src/
│   ├── config/        # Configuration files
│   ├── helpers/       # Helper utilities
│   ├── services/      # Core services
│   └── profileScraper.js # Main scraping logic
├── .env.example       # Example environment variables
├── .gitignore         # Git ignore file
├── package.json       # Project dependencies
└── scrape-profile.js  # CLI entry point
```

## Troubleshooting

If you encounter issues:

1. Check the console logs for error messages
2. Look at error screenshots in the `debug` directory
3. Ensure your LinkedIn credentials are correct
4. Try running without the `--headless` flag to see what's happening

## License

MIT

## Disclaimer

This tool is for educational purposes only. Use responsibly and in accordance with LinkedIn's terms of service.
