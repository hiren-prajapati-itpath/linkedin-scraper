const express = require('express');
const ProfileController = require('../controllers/profileController');
const LogHelper = require('../helpers/logHelper');
const router = express.Router();

// Middleware to validate request body
const validateProfileUrl = (req, res, next) => {
    const { profileUrl } = req.body;
    
    if (!profileUrl) {
        return res.status(400).json({
            error: 'Missing profile URL',
            message: 'Profile URL is required'
        });
    }

    if (!profileUrl.includes('linkedin.com/')) {
        return res.status(400).json({
            error: 'Invalid URL',
            message: 'URL must be a valid LinkedIn profile URL'
        });
    }

    next();
};

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        LogHelper.error('Route error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    });
};

// Routes
router.post('/screenshot', validateProfileUrl, asyncHandler(ProfileController.takeScreenshot));

module.exports = router;
