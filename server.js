require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

// Jobs
// require('./src/jobs/eventReminder').init();

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

// Cria servidor HTTP
const server = createServer(app);

// Configura WebSocket Server
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  clientTracking: true
});

// Estruturas de armazenamento
const connections = {
  conversations: new Map(), 
  groups: new Map(),
  users: new Map()
};

const userStatus = {
  online: new Map(),
  typing: new Map()
};

// Helpers
const authenticateToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    logger.error('JWT verification failed:', error);
    return null;
  }
};

const broadcastToEntity = (entityType, entityId, message) => {
  const connSet = connections[entityType].get(entityId);
  if (!connSet) return;

  connSet.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

const updateUserStatus = (userId, status) => {
  if (status === 'online') {
    userStatus.online.set(userId, { 
      lastSeen: Date.now(),
      ...status.metadata
    });
  } else {
    userStatus.online.delete(userId);
  }
};

// Handlers de mensagens
const messageHandlers = {
  CHAT_MESSAGE: (ws, data, { entityType, entityId, userId }) => {
    if (!data.message?.content) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
      return;
    }

    const savedMessage = {
      id: Date.now().toString(),
      senderId: userId,
      content: data.message.content,
      timestamp: new Date().toISOString(),
      entityType,
      entityId
    };

    // Broadcast para todos os participantes
    broadcastToEntity(entityType, entityId, {
      type: 'NEW_MESSAGE',
      message: savedMessage
    });

    // Confirmação para o remetente
    ws.send(JSON.stringify({ 
      type: 'MESSAGE_DELIVERED',
      messageId: savedMessage.id
    }));
  },

  TYPING_STATUS: (ws, data, { userId, entityType, entityId }) => {
    if (data.isTyping) {
      userStatus.typing.set(userId, { entityType, entityId, timestamp: Date.now() });
    } else {
      userStatus.typing.delete(userId);
    }

    broadcastToEntity(entityType, entityId, {
      type: 'TYPING_UPDATE',
      userId,
      isTyping: data.isTyping,
      typingUsers: Array.from(userStatus.typing.entries())
        .filter(([_, status]) => 
          status.entityType === entityType && 
          status.entityId === entityId
        )
        .map(([uid]) => uid)
    });
  },

  MESSAGE_READ: (ws, data, { userId, entityType, entityId }) => {
    broadcastToEntity(entityType, entityId, {
      type: 'MESSAGE_READ',
      messageId: data.messageId,
      userId
    });
  },

  GROUP_TOPIC_CHANGE: (ws, data, { userId, entityId }) => {
    
    const newTopic = {
      topic: data.topic,
      setBy: userId,
      setAt: new Date().toISOString()
    };


    broadcastToEntity('groups', entityId, {
      type: 'TOPIC_CHANGED',
      topic: newTopic
    });
  },

  PING: (ws, data, { userId }) => {
    if (userId) {
      updateUserStatus(userId, 'online');
    }
    ws.send(JSON.stringify({ type: 'PONG', timestamp: data.timestamp }));
  }
};

// Configuração do WebSocket Server
wss.on('connection', (ws, req) => {
  const pathParts = req.url.split('/').filter(Boolean);
  let connectionType, entityId, userId, token;

  try {
    // Autenticação via query parameter ou headers
    token = req.headers['sec-websocket-protocol'] || 
            new URLSearchParams(req.url.split('?')[1]).get('token');

    const decoded = authenticateToken(token);
    if (!decoded) {
      throw new Error('Authentication failed');
    }
    userId = decoded.userId;

    // Determina o tipo de conexão
    if (pathParts[0] === 'conversations' && pathParts[1]) {
      connectionType = 'conversations';
      entityId = pathParts[1];
    } else if (pathParts[0] === 'groups' && pathParts[1] && userId) {
      connectionType = 'groups';
      entityId = pathParts[1];
    } else {
      throw new Error('Invalid connection path');
    }

    // Registra a conexão
    if (!connections[connectionType].has(entityId)) {
      connections[connectionType].set(entityId, new Set());
    }
    connections[connectionType].get(entityId).add(ws);
    connections.users.set(userId, ws);

    // Atualiza status
    updateUserStatus(userId, 'online', { 
      entityType: connectionType, 
      entityId 
    });

    // Envia status inicial
    ws.send(JSON.stringify({
      type: 'CONNECTION_ESTABLISHED',
      entityType: connectionType,
      entityId,
      userId,
      onlineUsers: Array.from(userStatus.online.keys())
        .filter(uid => {
          const status = userStatus.online.get(uid);
          return status.entityType === connectionType && 
                 status.entityId === entityId;
        }),
      typingUsers: Array.from(userStatus.typing.keys())
        .filter(uid => {
          const status = userStatus.typing.get(uid);
          return status.entityType === connectionType && 
                 status.entityId === entityId;
        })
    }));

    // Configura handlers
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data);
        const handler = messageHandlers[parsed.type];
        
        if (handler) {
          handler(ws, parsed, { 
            entityType: connectionType, 
            entityId, 
            userId 
          });
        } else {
          throw new Error(`Unknown message type: ${parsed.type}`);
        }
      } catch (error) {
        logger.error('Message processing error:', error);
        ws.send(JSON.stringify({ 
          type: 'ERROR', 
          message: error.message 
        }));
      }
    });

    ws.on('close', () => {
      cleanUpConnection(ws, connectionType, entityId, userId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
      cleanUpConnection(ws, connectionType, entityId, userId);
    });

  } catch (error) {
    logger.error('Connection error:', error.message);
    ws.send(JSON.stringify({ 
      type: 'CONNECTION_ERROR', 
      message: error.message 
    }));
    ws.close(4000, error.message);
  }
});

// Limpeza de conexão
function cleanUpConnection(ws, connectionType, entityId, userId) {
  if (connections[connectionType]?.get(entityId)?.delete(ws)) {
    if (connections[connectionType].get(entityId).size === 0) {
      connections[connectionType].delete(entityId);
    }
  }

  if (userId) {
    connections.users.delete(userId);
    updateUserStatus(userId, 'offline');
    
    // Notifica outros usuários
    const status = userStatus.online.get(userId);
    if (status) {
      broadcastToEntity(status.entityType, status.entityId, {
        type: 'USER_STATUS_UPDATE',
        userId,
        isOnline: false,
        onlineUsers: Array.from(userStatus.online.keys())
          .filter(uid => {
            const s = userStatus.online.get(uid);
            return s.entityType === status.entityType && 
                   s.entityId === status.entityId;
          })
      });
    }
  }
}

// Limpeza periódica de conexões inativas
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 30000; // 30 segundos

  // Limpa usuários inativos
  Array.from(userStatus.online.entries()).forEach(([userId, status]) => {
    if (now - status.lastSeen > inactiveThreshold) {
      userStatus.online.delete(userId);
      broadcastToEntity(status.entityType, status.entityId, {
        type: 'USER_STATUS_UPDATE',
        userId,
        isOnline: false
      });
    }
  });

  // Limpa status de digitação expirados
  Array.from(userStatus.typing.entries()).forEach(([userId, status]) => {
    if (now - status.timestamp > 5000) { // 5 segundos sem digitar
      userStatus.typing.delete(userId);
      broadcastToEntity(status.entityType, status.entityId, {
        type: 'TYPING_UPDATE',
        userId,
        isTyping: false
      });
    }
  });
}, 10000); // Executa a cada 10 segundos

// Rotas HTTP para integração
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    connections: {
      conversations: connections.conversations.size,
      groups: connections.groups.size,
      users: connections.users.size
    }
  });
});

// Rotas da API
const apiRouter = require('./src/routes/index');
app.use('/api', apiRouter);

app.use(errorHandler);

// Inicia servidor
server.listen(port, () => {
  logger.info(`NODE & WEBSOCKET SERVER RUNNIG ON ${port} PORT`);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down WebSocket server');
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
  server.close();
});

module.exports = { server, wss };