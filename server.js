require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { createServer } = require('http');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');
const syncDatabase = require('./src/configs/sync');
const WebSocketManager = require('./websocket');

const app = express();
const port = process.env.WS_PORT || 5000;

// Middlewares
app.use(cors({
  origin: process.env.CORS_ORIGINS.split(','),
  credentials: true
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(errorHandler);

// Cria servidor HTTP
// const server = createServer(app);

// Inicializa WebSocket
// const wsManager = new WebSocketManager(server);

// Rotas HTTP para integração
// app.get('/health', (req, res) => {
//   res.json({ 
//     status: 'ok',
//     connections: wsManager.getConnectionStats()
//   });
// });

const startServer = async () => {
  try {
    // await syncDatabase({
    //   force: process.env.DB_FORCE_SYNC === 'true',
    //   alter: process.env.DB_ALTER_SYNC === 'true'
    // })

    // Rotas da API
    const apiRouter = require('./src/routes/index');
    app.use('/api', apiRouter);

    app.use(errorHandler);

    // Inicia servidor
    server.listen(port, () => {
      logger.info(`API & WEBSOCKET SERVER RUNNIG ON ${port} PORT`);
    });
  } catch (error) {
    logger.error('Falha ao iniciar o servidor:', error instanceof Error ? error.message : error);
    // process.exit(1);
  }
}

startServer();

// process.on('SIGTERM', () => {
//   logger.info('Shutting down WebSocket server');
//   wsManager.wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
//   server.close();
// });

// module.exports = { server, wsManager };
