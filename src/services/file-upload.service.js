const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { BadRequestError } = require('../utils/errors');

// Configuração do Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

/**
 * Faz upload de um arquivo para o Cloudinary
 * @param {Object} file - Objeto do arquivo (Multer)
 * @param {string} folder - Pasta de destino no Cloudinary
 * @param {Array<string>} allowedFormats - Formatos permitidos
 * @returns {Promise<Object>} Resultado do upload
 */
const uploadToCloudinary = (file, folder, allowedFormats = ['jpg', 'jpeg', 'png', 'gif']) => {
    return new Promise((resolve, reject) => {
        // Verifica o tipo do arquivo
        const fileFormat = file.originalname.split('.').pop().toLowerCase();
        if (!allowedFormats.includes(fileFormat)) {
            return reject(new BadRequestError(`Formato de arquivo não suportado. Use: ${allowedFormats.join(', ')}`));
        }

        // Cria um stream de upload
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `${process.env.CLOUDINARY_ROOT_FOLDER || 'classroom'}/${folder}`,
                resource_type: 'auto',
                allowed_formats: allowedFormats,
                format: fileFormat,
                transformation: [
                    { width: 500, height: 500, crop: 'limit' }
                ]
            },
            (error, result) => {
                if (error) {
                    console.error('Erro no upload para Cloudinary:', error);
                    return reject(new BadRequestError('Falha ao processar o arquivo'));
                }
                resolve(result);
            }
        );

        // Pipe do buffer para o stream de upload
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
};

/**
 * Remove um arquivo do Cloudinary
 * @param {string} publicId - Public ID do arquivo no Cloudinary
 * @returns {Promise<Object>} Resultado da remoção
 */
const deleteFromCloudinary = (publicId) => {
    return cloudinary.uploader.destroy(publicId);
};

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary
};