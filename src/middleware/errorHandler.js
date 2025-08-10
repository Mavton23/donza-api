const errorHandler = (err, req, res, next) => {
    if (!err.isOperational) {
        console.error('Erro crítico:', err);
        err.message = 'Ocorreu um erro interno no servidor';
        err.statusCode = 500;
    }

    res.status(err.statusCode).json({
        success: false,
        error: {
            message: err.message,
            code: err.statusCode,
            // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
    });
};

module.exports = errorHandler;