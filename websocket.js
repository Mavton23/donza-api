const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('./src/utils/logger');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    this.connections = {
      conversations: new Map(), 
      groups: new Map(),
      users: new Map()
    };

    this.userStatus = {
      online: new Map(),
      typing: new Map()
    };

    this.setupConnectionHandlers();
    this.setupCleanupInterval();
  }

  authenticateToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      logger.error('JWT verification failed:', error);
      return null;
    }
  }

  broadcastToEntity(entityType, entityId, message) {
    const connSet = this.connections[entityType].get(entityId);
    if (!connSet) return;

    connSet.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  updateUserStatus(userId, status, metadata) {
    if (status === 'online') {
      this.userStatus.online.set(userId, { 
        lastSeen: Date.now(),
        ...metadata
      });
    } else {
      this.userStatus.online.delete(userId);
    }
  }

  cleanUpConnection(ws, connectionType, entityId, userId) {
    if (this.connections[connectionType]?.get(entityId)?.delete(ws)) {
      if (this.connections[connectionType].get(entityId).size === 0) {
        this.connections[connectionType].delete(entityId);
      }
    }

    if (userId) {
      this.connections.users.delete(userId);
      this.updateUserStatus(userId, 'offline');
      
      const status = this.userStatus.online.get(userId);
      if (status) {
        this.broadcastToEntity(status.entityType, status.entityId, {
          type: 'USER_STATUS_UPDATE',
          userId,
          isOnline: false,
          onlineUsers: Array.from(this.userStatus.online.keys())
            .filter(uid => {
              const s = this.userStatus.online.get(uid);
              return s.entityType === status.entityType && 
                     s.entityId === status.entityId;
            })
        });
      }
    }
  }

  setupConnectionHandlers() {
    this.wss.on('connection', (ws, req) => {
      const pathParts = req.url.split('/').filter(Boolean);
      let connectionType, entityId, userId, token;

      try {
        token = req.headers['sec-websocket-protocol'] || 
                new URLSearchParams(req.url.split('?')[1]).get('token');

        const decoded = this.authenticateToken(token);
        if (!decoded) {
          throw new Error('Authentication failed');
        }
        userId = decoded.userId;

        if (pathParts[0] === 'conversations' && pathParts[1]) {
          connectionType = 'conversations';
          entityId = pathParts[1];
        } else if (pathParts[0] === 'groups' && pathParts[1] && userId) {
          connectionType = 'groups';
          entityId = pathParts[1];
        } else {
          throw new Error('Invalid connection path');
        }

        if (!this.connections[connectionType].has(entityId)) {
          this.connections[connectionType].set(entityId, new Set());
        }
        this.connections[connectionType].get(entityId).add(ws);
        this.connections.users.set(userId, ws);

        this.updateUserStatus(userId, 'online', { 
          entityType: connectionType, 
          entityId 
        });

        ws.send(JSON.stringify({
          type: 'CONNECTION_ESTABLISHED',
          entityType: connectionType,
          entityId,
          userId,
          onlineUsers: Array.from(this.userStatus.online.keys())
            .filter(uid => {
              const status = this.userStatus.online.get(uid);
              return status.entityType === connectionType && 
                     status.entityId === entityId;
            }),
          typingUsers: Array.from(this.userStatus.typing.keys())
            .filter(uid => {
              const status = this.userStatus.typing.get(uid);
              return status.entityType === connectionType && 
                     status.entityId === entityId;
            })
        }));

        ws.on('message', (data) => {
          this.handleMessage(ws, data, connectionType, entityId, userId);
        });

        ws.on('close', () => {
          this.cleanUpConnection(ws, connectionType, entityId, userId);
        });

        ws.on('error', (error) => {
          logger.error('WebSocket error:', error);
          this.cleanUpConnection(ws, connectionType, entityId, userId);
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
  }

  handleMessage(ws, data, connectionType, entityId, userId) {
    try {
      const parsed = JSON.parse(data);
      const handler = this.messageHandlers[parsed.type];
      
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
  }

  setupCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const inactiveThreshold = 30000;

      Array.from(this.userStatus.online.entries()).forEach(([userId, status]) => {
        if (now - status.lastSeen > inactiveThreshold) {
          this.userStatus.online.delete(userId);
          this.broadcastToEntity(status.entityType, status.entityId, {
            type: 'USER_STATUS_UPDATE',
            userId,
            isOnline: false
          });
        }
      });

      Array.from(this.userStatus.typing.entries()).forEach(([userId, status]) => {
        if (now - status.timestamp > 5000) {
          this.userStatus.typing.delete(userId);
          this.broadcastToEntity(status.entityType, status.entityId, {
            type: 'TYPING_UPDATE',
            userId,
            isTyping: false
          });
        }
      });
    }, 10000);
  }

  messageHandlers = {
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

      this.broadcastToEntity(entityType, entityId, {
        type: 'NEW_MESSAGE',
        message: savedMessage
      });

      ws.send(JSON.stringify({ 
        type: 'MESSAGE_DELIVERED',
        messageId: savedMessage.id
      }));
    },

    TYPING_STATUS: (ws, data, { userId, entityType, entityId }) => {
      if (data.isTyping) {
        this.userStatus.typing.set(userId, { entityType, entityId, timestamp: Date.now() });
      } else {
        this.userStatus.typing.delete(userId);
      }

      this.broadcastToEntity(entityType, entityId, {
        type: 'TYPING_UPDATE',
        userId,
        isTyping: data.isTyping,
        typingUsers: Array.from(this.userStatus.typing.entries())
          .filter(([_, status]) => 
            status.entityType === entityType && 
            status.entityId === entityId
          )
          .map(([uid]) => uid)
      });
    },

    MESSAGE_READ: (ws, data, { userId, entityType, entityId }) => {
      this.broadcastToEntity(entityType, entityId, {
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

      this.broadcastToEntity('groups', entityId, {
        type: 'TOPIC_CHANGED',
        topic: newTopic
      });
    },

    PING: (ws, data, { userId }) => {
      if (userId) {
        this.updateUserStatus(userId, 'online');
      }
      ws.send(JSON.stringify({ type: 'PONG', timestamp: data.timestamp }));
    }
  };

  getConnectionStats() {
    return {
      conversations: this.connections.conversations.size,
      groups: this.connections.groups.size,
      users: this.connections.users.size
    };
  }
}

module.exports = WebSocketManager;