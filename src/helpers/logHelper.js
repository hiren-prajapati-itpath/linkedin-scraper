class LogHelper {
    static info(message) {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    }

    static error(message, error = null) {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
        if (error) console.error(error);
    }
}

module.exports = LogHelper;