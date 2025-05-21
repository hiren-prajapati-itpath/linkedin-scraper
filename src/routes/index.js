const express = require('express');
const profileRoutes = require('./profileRoutes');
const router = express.Router();

// Register all routes
router.use('/profile', profileRoutes);

// Add more route categories here
// Example:
// router.use('/auth', authRoutes);
// router.use('/companies', companyRoutes);

module.exports = router;
