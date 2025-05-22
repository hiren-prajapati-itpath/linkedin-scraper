const express = require('express');
const profileRoutes = require('./profileRoutes');
const router = express.Router();

// Register all routes
router.use('/profile', profileRoutes);


module.exports = router;
