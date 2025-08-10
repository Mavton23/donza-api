const syncDatabase = require('../configs/sync');

// Opções:
// - force: true (RECRIA todas as tabelas)
// - alter: true (tenta ALTERAR tabelas existentes)
syncDatabase({ force: false, alter: true })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));