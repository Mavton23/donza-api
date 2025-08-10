require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sequelize } = require('../configs/db');
const { TempUser, User, UserDocument, Token } = require('../models');
const { Op } = require('sequelize');
const { sendVerificationEmail, sendRegistrationCompleteEmail, sendPasswordResetEmail, sendPasswordChangedEmail } = require('../services/email.service');
const notificationService = require('../services/notification.service');
const { uploadToCloudinary } = require('../services/file-upload.service');
const { 
    NotFoundError, 
    BadRequestError, 
    ForbiddenError,
    UnauthorizedError
} = require('../utils/errors');
const { createToken, createRefreshToken, verifyToken, revokeRefreshToken } = require('../services/auth.service');

// Função auxiliar para formatar URLs
function formatWebsiteUrl(url) {
    if (!url) return null;
    return url.startsWith('http') ? url : `https://${url}`;
}

module.exports = {
    /**
     * Primeira etapa do registro - Envia email de verificação
     */
    registerFirstStep: async (req, res, next) => {
        const transaction = await sequelize.transaction();

        try {
            const { email, password, role } = req.body;
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Verificar se já existe um usuário permanente com este email
            const existingUser = await User.findOne({ where: { email }, transaction });
            if (existingUser) {
                throw new BadRequestError('Email já está em uso');
            }

            // Verificar se já existe um tempUser com este email
            const existingTempUser = await TempUser.findOne({ where: { email }, transaction });
            if (existingTempUser) {
                // Atualiza o registro temporário existente
                existingTempUser.password = await bcrypt.hash(password, 12);
                existingTempUser.verificationToken = verificationToken;
                existingTempUser.tokenExpires = tokenExpires;
                existingTempUser.verificationAttempts += 1;
                existingTempUser.role = role;
                await existingTempUser.save({ transaction });
            } else {
                // Cria novo registro temporário
                await TempUser.create({
                    email, 
                    password: await bcrypt.hash(password, 12),
                    verificationToken,
                    tokenExpires,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    role: role
                }, { transaction });
            }
            
            await transaction.commit();

            // Enviar email de verificação
            try {
                await sendVerificationEmail(email, verificationToken);
            } catch (notifyError) {
                console.error("Erro no envio de email: ", notifyError);
            }

        
            res.status(200).json({
                success: true,
                data: { token: verificationToken },
                message: 'Email de verificação enviado com sucesso!'
            });
        } catch (error) {
            transaction.rollback();
            next(error);
        }
    },

    uploadRegistrationDocuments: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { token, role, username, fullName, educationLevel, educationField, nuit, legalRepresentative } = req.body;
            
            if (!token || !role) {
                throw new BadRequestError('Token e perfil são obrigatórios');
            }

            const tempUser = await TempUser.findOne({ 
                where: { verificationToken: token },
                transaction
            });

            if (!tempUser) {
                throw new BadRequestError('Token inválido ou expirado');
            }

            // Verifica se já existem documentos submetidos
            if (tempUser.documents && tempUser.documents.length > 0 && tempUser.registrationStatus === 'documents_uploaded') {
                await transaction.commit();
                return res.status(200).json({
                    success: true,
                    documents: tempUser.documents.map(doc => ({
                        type: doc.type,
                        url: doc.url,
                        originalName: doc.originalName
                    })),
                    message: 'Documentos já foram enviados anteriormente'
                });
            }

            // Processa os arquivos recebidos
            const processedDocs = [];
            const documentFields = {
                instructor: ['diplomas', 'experiencia', 'certificacoes', 'registroProfissional'],
                institution: ['alvara', 'credenciamento', 'estatutos', 'endereco']
            };

            // Processamento paralelo de arquivos
            await Promise.all(documentFields[role].map(async (field) => {
                if (req.files[field]) {
                    await Promise.all(req.files[field].map(async (file) => {
                        try {
                            const result = await uploadToCloudinary(
                                file,
                                `user_documents/${tempUser.tempId}`,
                                ['pdf', 'png', 'jpg', 'jpeg']
                            );

                            const userDoc = await UserDocument.create({
                                userId: null,
                                tempUserId: tempUser.tempId,
                                documentType: field,
                                originalName: file.originalname,
                                storageKey: result.public_id,
                                storageProvider: 'cloudinary',
                                mimeType: file.mimetype,
                                size: file.size,
                                status: 'pending',
                                metadata: {
                                    uploadSource: 'registration',
                                    tempUserId: tempUser.tempId,
                                    role: role
                                }
                            }, { transaction });

                            processedDocs.push({
                                type: field,
                                originalName: file.originalname,
                                storageKey: result.public_id,
                                mimeType: file.mimetype,
                                size: file.size,
                                url: result.secure_url,
                                documentId: userDoc.docId
                            });
                        } catch (uploadError) {
                            console.error(`Erro no upload de ${file.originalname}:`, uploadError instanceof Error ? uploadError.message : uploadError);
                            throw uploadError;
                        }
                    }));
                }
            }));

            const requiredDocs = {
                instructor: ['diplomas', 'experiencia'],
                institution: ['alvara', 'credenciamento', 'estatutos', 'endereco']
            };

            const missingDocs = requiredDocs[role].filter(
                doc => !processedDocs.some(d => d.type === doc)
            );
            
            if (missingDocs.length > 0) {
                await transaction.rollback();
                return next(new BadRequestError(`Documentos obrigatórios faltando: ${missingDocs.join(', ')}`));
            }

            const updateData = {
                isEmailVerified: true,
                documents: processedDocs,
                registrationStatus: 'documents_uploaded',
                potentialUsername: username || null,
                potentialFullname: fullName || null,
                potentialNuit: nuit || null,
                ...(role === 'instructor' && { 
                    educationLevel: educationLevel || null,
                    educationField: educationField || null 
                }),
                ...(role === 'institution' && { 
                    legalRepresentative: legalRepresentative || null 
                })
            };

            await tempUser.update(updateData, { transaction });
            await transaction.commit();

            res.status(200).json({
            success: true,
            documents: processedDocs.map(doc => ({
                type: doc.type,
                url: doc.url,
                originalName: doc.originalName
            }))
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            console.error('Erro no uploadRegistrationDocuments:', error instanceof Error ? error.message : error);
            next(error);
        }
    },

    /**
     * Verifica se um token de verificação é válido
     */
    verifyTempToken: async (req, res, next) => {
        const transaction = await sequelize.transaction();

        try {
            const { token } = req.params;
            
            const tempUser = await TempUser.findOne({
                where: {
                    verificationToken: token,
                    tokenExpires: { [Op.gt]: new Date() }
                },
                transaction
            });
            
            if (!tempUser) {
                throw new BadRequestError('Token inválido ou expirado');
            }

            await transaction.commit();
            
            res.json({
                success: true,
                data: {
                    email: tempUser.email,
                    isEmailVerified: tempUser.isEmailVerified
                }
            });
        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

    /**
     * Segunda etapa do registro - Completa o cadastro
     */
    registerLastStep: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { token, username, role } = req.body;

            const whereClause = {
                verificationToken: token,
                tokenExpires: { [Op.gt]: new Date() }
            };

            // Para estudantes, não exigir documents_uploaded
            if (role !== 'student') {
                whereClause.registrationStatus = 'documents_uploaded';
            }

            // Verificar token e buscar usuário temporário
            const tempUser = await TempUser.findOne({ 
                where: whereClause,
                transaction
            });

            const documents = await UserDocument.findAll({
                where: { 
                    tempUserId: tempUser.tempId 
                },
                transaction
            });
            
            if (!tempUser) {
                throw new BadRequestError('Token inválido, expirado ou email não verificado');
            }

            // Verificar se o username já existe
            const existingUser = await User.findOne({ where: { username }, transaction });
            if (existingUser) {
                throw new BadRequestError('Nome de usuário já está em uso');
            }

            // Criar o usuário
            const userData = {
                username,
                email: tempUser.email,
                password: tempUser.password,
                role: tempUser.role,
                isVerified: true,
                ipAddress: tempUser.ipAddress,
                status: tempUser.role === 'student' ? 'approved' : 'pending',
                fullName: tempUser.potentialFullname || null,
                nuit: tempUser.potentialNuit || null,
                verificationData: {
                    documentsCount: tempUser.documents?.length || 0
                }
            };

            // Adicionar campos específicos por role
            if (tempUser.role === 'instructor') {
                userData.educationLevel = tempUser.educationLevel || null;
                userData.educationField = tempUser.educationField || null;
                userData.verificationData.qualifications = tempUser.documents
                    ?.filter(d => d.type === 'diplomas') // Note que no seu código anterior era 'diploma' mas no upload é 'diplomas'
                    .map(d => d.originalName) || [];
            }

            if (tempUser.role === 'institution') {
                userData.institutionName = tempUser.potentialInstitutionName;
                userData.legalRepresentative = tempUser.legalRepresentative || null;
                userData.verificationData.documents = tempUser.documents?.map(d => ({
                    type: d.type,
                    originalName: d.originalName,
                    uploadedAt: new Date().toISOString()
                })) || [];
            }

            const user = await User.create(userData, { transaction });

            // Migra documentos para o usuário permanente
            if (documents && documents.length > 0) {
                await UserDocument.update(
                    { 
                        userId: user.userId,
                        tempUserId: null
                    },
                    { 
                        where: { 
                            tempUserId: tempUser.tempId 
                        },
                        transaction 
                    }
                );
            }

            if (['instructor', 'institution'].includes(tempUser.role)) {
                try {
                    await notificationService.notifyAdminsForUserReview(
                        user.userId,
                        user.role,
                        tempUser.documents?.length || 0,
                    );
                } catch (notifyError) {
                    console.error('Falha ao notificar admins:', notifyError);
                }
            }

            await tempUser.destroy({ transaction });

            if (!process.env.REFRESH_TOKEN_SECRET || !process.env.ACCESS_TOKEN_SECRET) {
                throw new Error('Configuração de segurança incompleta');
            }

            // Gerar tokens
            const accessToken = createToken(user);
            const refreshToken = await createRefreshToken(user);

            await transaction.commit();

            res.status(201).json({
                success: true,
                data: {
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    accessToken,
                    refreshToken,
                    profileCompleted: user.profileCompleted
                },
                message: user.status === 'pending' 
                    ? 'Seu registro está em revisão. Você será notificado quando for aprovado.' 
                    : 'Registro concluído com sucesso!'
                });
        } catch (error) {
            transaction.rollback()
            next(error);
        }
    },

    completeProfile: async (req, res, next) => {
        const transaction = await sequelize.transaction();

        function isValidUrl(url) {
            try {
                new URL(url);
                return true;
            } catch (err) {
                return false;
            }
        }

        // Validação de telefone
        function isValidPhone(phone) {
            if (!phone) return true;
            const regex = /^(\+\d{1,3}[- ]?)?\d{10,15}$/;
            return regex.test(phone.replace(/[^\d+]/g, ''));
        }

        try {
            const {
                userId,
                fullName, 
                bio, 
                expertise, 
                interests, 
                website, 
                avatarUrl,
                institutionName,
                institutionType,
                academicPrograms,
                contactPhone,
                legalRepresentative,
                accreditation,
                yearFounded,
                teachingExperience,
                profileCompleted = true,
                isRegistrationFlow = false
            } = req.body;
    
            const user = await User.findByPk(userId, {
                attributes: { exclude: ['password'] }
            }, transaction);
    
            if (!user) {
                throw new NotFoundError('Usuário não encontrado');
            }
    
            // Verificação de segurança
            if (user.userId !== userId && req.user.role !== 'admin') {
                throw new ForbiddenError('Ação não autorizada');
            }
    
            // Validação condicional por role
            if (!isRegistrationFlow) {
                if (user.role === 'instructor') {
                    if (expertise && expertise.length < 3) {
                        throw new BadRequestError('Selecione pelo menos 3 áreas de expertise');
                    }
                } else if (user.role === 'student') {
                    if (interests && interests.length < 1) {
                        throw new BadRequestError('Selecione pelo menos 1 interesse');
                    }
                } else if (user.role === 'institution') {
                    if (!institutionName?.trim()) {
                        throw new BadRequestError('Nome da instituição é obrigatório');
                    }
                    if (!institutionType) {
                        throw new BadRequestError('Tipo de instituição é obrigatório');
                    }
                    if (academicPrograms && academicPrograms.length < 1) {
                        throw new BadRequestError('Selecione pelo menos 1 programa acadêmico');
                    }
                }
            }
    
            // Validação de URL
            if (website && !isValidUrl(website)) {
                throw new BadRequestError('Formato de URL inválido');
            }

            // Validação de telefone
            if (contactPhone && !isValidPhone(contactPhone)) {
                throw new BadRequestError('Formato de telefone inválido');
            }

            // Validação de ano de fundação para instituições
            if (yearFounded && (yearFounded < 1000 || yearFounded > new Date().getFullYear())) {
                throw new BadRequestError('Ano de fundação inválido');
            }

            // Validação de experiência de ensino para instituições
            if (teachingExperience && teachingExperience < 0) {
                throw new BadRequestError('Experiência de ensino não pode ser negativa');
            }
    
            // Preparar dados para atualização
            const updateData = {
                bio: bio || null,
                website: website ? formatWebsiteUrl(website) : null,
                avatarUrl: avatarUrl || user.avatarUrl || null,
                profileCompleted: isRegistrationFlow ? true : profileCompleted,
                lastUpdated: new Date(),
                ...(['instructor', 'institution'].includes(user.role) && {
                    contactPhone: contactPhone || null
                }),
                // Campos específicos por role
                ...(user.role === 'instructor' && {
                    fullName: fullName || user.fullName,
                    expertise: expertise || [],
                    educationLevel: req.body.educationLevel || user.educationLevel || null,
                    educationField: req.body.educationField || user.educationField || null
                }),
                ...(user.role === 'student' && {
                    fullName: fullName || user.fullName,
                    interests: interests || []
                }),
                ...(user.role === 'institution' && {
                    institutionName: institutionName || user.institutionName || null,
                    institutionType: institutionType || user.institutionType || null,
                    academicPrograms: academicPrograms || [],
                    legalRepresentative: legalRepresentative || null,
                    accreditation: accreditation || null,
                    yearFounded: yearFounded || null,
                    teachingExperience: teachingExperience || null
                })
            };

            // Atualização do usuário
            await User.update(updateData, {
                where: { userId: user.userId }
            }, transaction);

            const updatedUser = await User.findByPk(userId, {
                attributes: { exclude: ['password'] }
            }, transaction);

            await transaction.commit();

            // Notificar o usuário
            try {
                // Enviar e-mail
                await sendRegistrationCompleteEmail(user);

                // Criar notificação interna
                await notificationService.notifyUser(
                    user.userId,
                    'DONZA_NOTIFICATION',
                    `Bem-vindo(a) à plataforma, ${user.username || 'usuário'}! Seu perfil foi concluído com sucesso.`,
                    {
                        title: 'Registro Concluído',
                        avatarUrl: user.avatarUrl,
                        role: user.role
                    }
                )
            } catch (notifyError) {
                console.error("Erro ao tentar notificar usuário: ", notifyError instanceof Error ? notifyError.message : notifyError)
            }
    
            res.json({
                success: true,
                data: {
                user: updatedUser,
                ...(isRegistrationFlow && {
                    token: createToken(updatedUser.userId, updatedUser.role),
                    refreshToken: createRefreshToken(updatedUser.userId)
                })
            }
            });
    
        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

    /**
     * Verificação de email
     */
    verifyEmail: async (req, res, next) => {
        const transaction = await sequelize.transaction();

        try {
            const { token } = req.query;

            if (!token) {
                throw new BadRequestError('Token de verificação não fornecido');
            }

            // Busca o usuário temporário pelo token
            const tempUser = await TempUser.findOne({
                where: {
                    verificationToken: token,
                    tokenExpires: { [Op.gt]: new Date() }
                },
                transaction
            });

            if (!tempUser) {
                throw new BadRequestError('Token de verificação inválido ou expirado');
            }

            // Marca o email como verificado
            tempUser.isEmailVerified = true;
            tempUser.tokenExpires = new Date(Date.now() + 2 * 60 * 60 * 1000); // Extende o tempo
            await tempUser.save({ transaction });

            await transaction.commit();

            res.json({
                success: true,
                message: 'Email verificado com sucesso',
                data: {
                    email: tempUser.email,
                    nextStep: '/register/complete'
                }
            });
        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

    /**
     * Reenvia o email de verificação
     */
    resendVerificationEmail: async (req, res, next) => {
        const transaction = await sequelize.transaction();

        try {
            const { email } = req.body;
            const verificationToken = crypto.randomBytes(20).toString('hex');

            const tempUser = await TempUser.findOne({ where: { email }, transaction });
            if (!tempUser) {
                throw new BadRequestError('Nenhum registro pendente encontrado para este email');
            }

            if (tempUser.verificationAttempts >= 5) {
                throw new BadRequestError('Limite de tentativas excedido. Por favor, aguarde antes de tentar novamente.');
            }

            // Atualiza o token e aumenta as tentativas
            tempUser.verificationToken = verificationToken;
            tempUser.tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
            tempUser.verificationAttempts += 1;
            await tempUser.save({ transaction });

            await transaction.commit();

            // Envia o novo email
            await sendVerificationEmail(email, verificationToken);

            res.json({
                success: true,
                message: 'Email de verificação reenviado com sucesso'
            });
        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

    /**
     * Login de usuário
     */
    login: async (req, res, next) => {
        try {
            const { email, password } = req.body;

            const user = await User.findOne({ where: { email } });
            if (!user) {
                throw new NotFoundError('Usuário não encontrado');
            }
        
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                throw new BadRequestError('Credenciais inválidas');
            }

            if (!user.isVerified) {
                throw new ForbiddenError('Por favor, verifique seu email antes de fazer login');
            }

            // Gerar tokens
            const accessToken = createToken(user);
            const refreshToken = await createRefreshToken(user);

            await User.update(
                { lastLogin: new Date() },
                { where: { userId: user.userId } }
            );

            res.json({
                success: true,
                data: {
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    avatarUrl: user.avatarUrl,
                    accessToken,
                    refreshToken
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Refresh Token
     */
    refreshToken: async (req, res, next) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                throw new BadRequestError('Refresh token não fornecido');
            }

            // Verifica se o refresh token está revogado
            const isRevoked = await Token.findOne({ 
                where: { 
                    token: refreshToken,
                    revoked: true
                } 
            });

            if (isRevoked) {
                throw new UnauthorizedError('Refresh token inválido');
            }

            // Verifica o token JWT
            const decoded = await verifyToken(refreshToken, true);

            // Busca o usuário
            const user = await User.findByPk(decoded.userId);
            if (!user) {
                throw new NotFoundError('Usuário não encontrado');
            }

            // Gera novo access token
            const newAccessToken = createToken(user);

            res.json({
                success: true,
                data: {
                    accessToken: newAccessToken
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /***
     * Gerar token de reset e enviar email
     */

    forgotPassword: async (req, res) => {
        try {
          const { email } = req.body;
          
          // Verificar se usuário existe
          const user = await User.findOne({ email });
          if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
          }
      
          // Gerar token de reset
          const resetToken = crypto.randomBytes(32).toString('hex');
          const passwordResetToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
      
          // Definir expiração (1 hora)
          const passwordResetExpires = Date.now() + 3600000; // 1 hora
      
          // Salvar no banco de dados
          user.passwordResetToken = passwordResetToken;
          user.passwordResetExpires = passwordResetExpires;
          await user.save();
      
          // Enviar email
          const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
          
          await sendPasswordResetEmail(user, resetToken)
      
          res.status(200).json({ 
            message: 'Email de recuperação enviado com sucesso' 
          });
        } catch (error) {
          res.status(500).json({ message: error.message });
        }
      },

    /**
     * Atualizar senha
     */

    resetPassword: async (req, res) => {
        try {
          const { token } = req.params;
          const { password } = req.body;
      
          // 1. Hash do token recebido
          const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
      
          // 2. Buscar usuário com token válido
          const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
          });
      
          if (!user) {
            return res.status(400).json({ message: 'Token inválido ou expirado' });
          }
      
          // 3. Atualizar senha
          user.password = password;
          user.passwordResetToken = undefined;
          user.passwordResetExpires = undefined;
          await user.save();
      
          // 4. Enviar confirmação (opcional)
          await sendPasswordChangedEmail(user);
      
          res.status(200).json({ 
            message: 'Senha atualizada com sucesso' 
          });
        } catch (error) {
          res.status(500).json({ message: error.message });
        }
    },

    /**
     * Logout
     */
    logout: async (req, res, next) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                throw new BadRequestError('Refresh token não fornecido');
            }

            // Revoga o refresh token
            await revokeRefreshToken(refreshToken);

            res.json({
                success: true,
                message: 'Logout realizado com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Middleware para verificar email verificado
     */
    ensureEmailVerified: async (req, res, next) => {
        try {
            const { token } = req.query;
            
            if (!token) {
                throw new BadRequestError('Token de verificação é obrigatório');
            }

            const tempUser = await TempUser.findOne({
                where: {
                    verificationToken: token,
                    isEmailVerified: true,
                    tokenExpires: { [Op.gt]: new Date() }
                }
            });

            if (!tempUser) {
                throw new ForbiddenError('Email não verificado ou token expirado');
            }

            req.tempUser = tempUser;
            next();
        } catch (error) {
            next(error);
        }
    }
};