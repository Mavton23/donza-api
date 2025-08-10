require('dotenv').config();
const jwt = require('jsonwebtoken');
const { Token } = require('../models');

/**
 * Gera um token JWT de acesso
 * @param {Object} user - Objeto do usuário
 * @param {string} user.userId - ID do usuário
 * @param {string} user.role - Role do usuário
 * @returns {string} Token JWT
 */
const createToken = (user) => {
    const payload = {
        userId: user.userId,
        role: user.role,
        email: user.email
    };

    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRATION || '1h' }
    );
};

/**
 * Gera um refresh token e armazena no banco
 * @param {Object} user - Objeto do usuário
 * @returns {Promise<string>} Refresh token
 */
const createRefreshToken = async (user) => {
    try {
    if (!process.env.REFRESH_TOKEN_SECRET) {
        throw new Error('REFRESH_TOKEN_SECRET não está configurado no ambiente');
    }

    const refreshToken = jwt.sign(
        { userId: user.userId },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    );

    // Armazena o refresh token no banco
    await Token.create({
        token: refreshToken,
        userId: user.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
    });

    return refreshToken;
    } catch (error) {
        console.log(error instanceof Error ? error.message : error)
    }
};

/**
 * Verifica e decodifica um token JWT
 * @param {string} token - Token JWT
 * @param {boolean} isRefresh - Se é um refresh token
 * @returns {Promise<Object>} Payload decodificado
 */
const verifyToken = async (token, isRefresh = false) => {
    const secret = isRefresh ? process.env.REFRESH_TOKEN_SECRET : process.env.JWT_SECRET;
    return jwt.verify(token, secret);
};

/**
 * Revoga um refresh token
 * @param {string} token - Refresh token a ser revogado
 * @returns {Promise<void>}
 */
const revokeRefreshToken = async (token) => {
    await Token.destroy({ where: { token } });
};

module.exports = {
    createToken,
    createRefreshToken,
    verifyToken,
    revokeRefreshToken
};