const { checkDatabaseConnection } = require('./databaseService');
const { checkCacheConnection } = require('./cacheService');
const { checkStorageConnection } = require('./storageService');
const { checkEmailService } = require('./emailService');

async function checkSystemHealth() {
  const checks = await Promise.all([
    checkDatabaseConnection(),
    checkCacheConnection(),
    checkStorageConnection(),
    checkEmailService()
  ]);

  return {
    api: {
      status: 'operational',
      version: process.env.API_VERSION || '1.0.0',
      responseTime: Date.now()
    },
    database: checks[0],
    cache: checks[1],
    storage: checks[2],
    email: checks[3],
    lastChecked: new Date().toISOString()
  };
}

async function checkDatabaseConnection() {
  try {
    const start = Date.now();
    await sequelize.authenticate();
    return {
      status: 'operational',
      responseTime: Date.now() - start,
      version: await getDatabaseVersion()
    };
  } catch (error) {
    return {
      status: 'outage',
      error: error.message,
      responseTime: null
    };
  }
}

module.exports = {
  checkSystemHealth
};