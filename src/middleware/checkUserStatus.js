const { ForbiddenError } = require('../utils/errors');
const { User } = require('../models');


/**
 * Middleware para verificar o status do usuário.
 * Permite o acesso apenas se o status estiver entre os permitidos.
 *
 * @param {string[]} allowedStatuses - Lista de status permitidos (ex: ['approved']).
 * @returns {Function} Middleware Express.
 */
function checkUserStatus(allowedStatuses = ['approved']) {
  return async (req, res, next) => {
    try {
      const { userId, role } = req.user;

      // Admin tem acesso irrestrito
      if (role === 'admin') return next();

      // Verificação do usuário
      const user = await User.findByPk(userId, {
        attributes: ['userId', 'status', 'isVerified', 'role'],
        raw: true
      });

      if (!user) {
        throw new ForbiddenError('Usuário não encontrado');
      }

      // Verifica status e verificação do usuário
      if (!allowedStatuses.includes(user.status)) {
        throw new ForbiddenError(
          `Ação não permitida para perfis ${user.status}. ` +
          'Seu perfil precisa ser aprovado pela equipe Donza.'
        );
      }

      if (user.role === 'instructor' && !user.isVerified) {
        throw new ForbiddenError('Seu perfil de instrutor precisa ser verificado');
      }

      if (user.role === 'institution' && !user.isVerified) {
        throw new ForbiddenError('Seu perfil de instituição precisa ser verificado');
      }

      next();
    } catch (error) {
      console.error('Erro na verificação de status:', error instanceof Error ? error.message : error);
      next(error);
    }
  };
}

module.exports = {
    checkUserStatus
};