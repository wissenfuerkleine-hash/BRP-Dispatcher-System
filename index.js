const dashboardApp = require('./dashboard/server');
require('dotenv').config();

// Start dashboard server first
const PORT = process.env.PORT || 3000;
const server = dashboardApp.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard running on port ${PORT}`);
});

// Try to start bot asynchronously
setTimeout(async () => {
  try {
    const SecurityBot = require('./bot/bot');
    const RestoreManager = require('./systems/restore');
    
    const bot = new SecurityBot();
    bot.start();

    // Wait for bot to be ready
    setTimeout(() => {
      const lockdownSystem = bot.getLockdownSystem();
      if (lockdownSystem) {
        dashboardApp.setLockdownSystem(lockdownSystem);
      }
      
      const restoreManager = new RestoreManager(bot.client);
      dashboardApp.setRestoreManager(restoreManager);
      console.log('Bot connected successfully');
    }, 10000);
  } catch (error) {
    console.error('Bot failed to start:', error.message);
    console.log('Dashboard continues running without bot');
  }
}, 2000);

console.log('Application started');
