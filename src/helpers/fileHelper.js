const fs = require('fs').promises;
const path = require('path');
const LogHelper = require('./logHelper');

class FileHelper {
    static async createDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return dirPath;
        } catch (error) {
            LogHelper.error(`Failed to create directory ${dirPath}:`, error);
            throw error;
        }
    }

    static async saveScreenshot(page, directory, filename) {
        try {
            await this.createDirectory(directory);
            const filePath = path.join(directory, `${filename}.png`);
            await page.screenshot({ 
                path: filePath,
                fullPage: true,
                type: 'png'
            });
            return filePath;
        } catch (error) {
            LogHelper.error('Failed to save screenshot:', error);
            throw error;
        }
    }

    static async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = FileHelper;