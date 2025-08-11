const syncDatabase = require('../configs/sync');

syncDatabase({ force: false, alter: true })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));