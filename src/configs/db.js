require('dotenv').config();

const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false,
        define: {
            timestamps: false
        }
    }
);

sequelize.authenticate()
    .then(() => {
        logger.info('Conexão com o PostgreSQL foi bem-sucedida!')
    })
    .catch((error) => {
        logger.error('Erro ao conectar ao banco de dados:', error);
    }) 


    module.exports = {
        Sequelize: Sequelize,
        sequelize: sequelize
    };