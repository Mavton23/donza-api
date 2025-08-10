const fs = require('fs');
const path = require('path');
const db = require('../configs/db');
const Sequelize = db.Sequelize;
const basename = path.basename(__filename);
const models = {};

// Carrega todos os modelos
fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js'
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(db.sequelize, Sequelize);
    models[model.name] = model;
  });


// Configura as associações
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = {
  ...models,
  sequelize: db.sequelize,
  Sequelize: db.Sequelize
};