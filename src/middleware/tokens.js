require('dotenv').config()
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const generateToken = (user) => {
    logger.info('Gerando token para:', { 
        name: user.name, 
        managerId: user.managerId,
        email: user.email
    });
    
    return jwt.sign(
        {
            userId: user._id,
            managerId: user.managerId,
            email: user.email,
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token inválido.' });
        req.user = user;
        next();
    });
};

module.exports = { 
    generateToken, 
    authenticateToken
};