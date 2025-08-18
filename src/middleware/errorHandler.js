const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  if (!err.isOperational) {
    console.error('Erro inesperado:', err);
    err = new AppError('Ocorreu um erro inesperado', 500);
  }

  // Responder com JSON
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
    }
  });
};

module.exports = errorHandler;