
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;
const ProfileController = require('./controllers/profileController');
const LogHelper = require('./helpers/logHelper');
const BrowserHelper = require('./helpers/browserHelper');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create necessary directories
async function setupDirectories() {
  const dirs = ['logs', 'screenshots', 'debug'];

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error(`Error creating ${dir} directory:`, error);
    }
  }
}

// Routes
app.post('/api/screenshot', ProfileController.takeScreenshot);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'LinkedIn Screenshot Service is running' });
});

// Start server
async function startServer() {
  try {
    // Set up directories
    await setupDirectories();

    // Verify browser setup
    const browserCheck = await BrowserHelper.verifyBrowserSetup();
    if (!browserCheck) {
      throw new Error('Browser setup verification failed. Please check system requirements.');
    }

    // Start server
    app.listen(PORT, () => {
      LogHelper.info(`Server running on port ${PORT}`);
      console.log(`LinkedIn Screenshot Service running on port ${PORT}`);
    });
  } catch (error) {
    LogHelper.error('Server startup failed:', error);
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();