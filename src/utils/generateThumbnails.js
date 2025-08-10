const cloudinary = require('cloudinary').v2;

async function generateVideoThumbnail(uploadResult) {
    try {
        // Extrai o public_id do resultado do upload
        const publicId = uploadResult.public_id;
        
        // Gera a URL do thumbnail usando o Cloudinary
        const thumbnailUrl = cloudinary.url(publicId, {
            resource_type: "video",
            transformation: [
                { width: 800, height: 450, crop: "fill" },
                { quality: "auto" },
                { format: "jpg" }
            ]
        });
        
        return thumbnailUrl;
    } catch (error) {
        console.error('Error generating video thumbnail:', error);
        return null;
    }
}

async function generatePdfThumbnail(uploadResult) {
    try {
        // Extrai o public_id do resultado do upload
        const publicId = uploadResult.public_id;
        
        // Gera a URL do thumbnail usando o Cloudinary
        const thumbnailUrl = cloudinary.url(publicId, {
            resource_type: "image",
            transformation: [
                { width: 800, height: 450, crop: "fill", page: 1 },
                { quality: "auto" },
                { format: "jpg" }
            ]
        });
        
        return thumbnailUrl;
    } catch (error) {
        console.error('Error generating PDF thumbnail:', error);
        return null;
    }
}

module.exports = {
    generateVideoThumbnail,
    generatePdfThumbnail
}

