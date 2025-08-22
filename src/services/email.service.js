const nodemailer = require('nodemailer');
const path = require('path');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const handlebars = require('handlebars');
const { BadRequestError } = require('../utils/errors');

// Configuração do transporter
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false 
  }
});

// Cache de templates
const emailTemplates = {};

/**
 * Carrega os templates de email
 */
async function loadTemplates() {
  try {
    const templateDir = path.join(__dirname, '../templates/emails');
    const templateFiles = await fs.readdir(templateDir);
    
    for (const file of templateFiles) {
      if (file.endsWith('.hbs')) {
        const templatePath = path.join(templateDir, file);
        const templateContent = await fs.readFile(templatePath, 'utf8');
        const templateName = file.replace('.hbs', '');
        emailTemplates[templateName] = handlebars.compile(templateContent);
      }
    }
  } catch (error) {
    console.error('Erro ao carregar templates de email:', error);
    throw error;
  }
}

// Carrega os templates ao iniciar
loadTemplates().catch(err => console.error('Failed to load email templates:', err));

/**
 * Envia notificação baseada em template com fallback
 */
async function sendNotificationEmail(user, notificationData) {
  const {
    subject,
    templateName = 'notification',
    context = {},
    priority = 'normal'
  } = notificationData;

  try {
    // Configuração básica do contexto
    const emailContext = {
      appName: process.env.APP_NAME || 'Donza',
      primaryColor: '#4CAF50',
      username: user.username,
      ...context,
      unsubscribeUrl: `${process.env.FRONTEND_URL}/notifications/preferences`,
      currentYear: new Date().getFullYear()
    };

    let html;
    try {
      const template = await loadTemplates(templateName);
      html = template(emailContext);
    } catch {
      html = compiledBaseTemplate({
        ...emailContext,
        content: context.message || notificationData.message
      });
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `[Notificação] ${subject}`,
      html,
      priority,
      headers: {
        'X-Priority': priority === 'high' ? '1' : '3',
        'X-MSMail-Priority': priority === 'high' ? 'High' : 'Normal'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Notificação enviada para ${user.email}`, {
      type: notificationData.type,
      messageId: info.messageId
    });

    return info;
  } catch (error) {
    logger.error('Falha ao enviar notificação', {
      userId: user.userId,
      error: error.message,
      type: notificationData.type
    });
    throw error;
  }
}

/**
 * Envia notificação de evento
 */
async function sendEventNotification(user, event, timeRemaining) {
  return sendNotificationEmail(user, {
    type: 'EVENT_REMINDER',
    subject: `Lembrete: ${event.title} em ${timeRemaining}`,
    templateName: 'event-reminder',
    context: {
      eventName: event.title,
      eventTime: event.startTime.toLocaleString(),
      eventUrl: `${process.env.FRONTEND_URL}/events/${event.eventId}`,
      message: `O evento "${event.title}" está programado para começar em ${timeRemaining}.`
    },
    priority: 'high'
  });
}

/**
 * Envia notificação de tarefa
 */
async function sendTaskNotification(user, task, timeRemaining) {
  return sendNotificationEmail(user, {
    type: 'TASK_DEADLINE',
    subject: `Prazo próximo: ${task.title}`,
    templateName: 'task-reminder',
    context: {
      taskName: task.title,
      dueDate: task.dueDate.toLocaleString(),
      taskUrl: `${process.env.FRONTEND_URL}/tasks/${task.taskId}`,
      message: `A tarefa "${task.title}" vence em ${timeRemaining}.`
    },
    priority: 'high'
  });
}

/**
 * Envia email de verificação para registro em duas etapas
 * @param {string} email - Email do usuário
 * @param {string} verificationToken - Token de verificação
 */
const sendVerificationEmail = async (email, verificationToken) => {
  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/register?token=${verificationToken}`;
    const terms = `${process.env.FRONTEND_URL}/terms`
    const privacy = `${process.env.FRONTEND_URL}/privacy`

    // Renderiza o template
    const emailHtml = emailTemplates['verification']({
      verificationUrl,
      email,
      supportEmail: process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com',
      helpUrl: "https://donza.com/help",
      terms,
      privacy,
      appName: process.env.APP_NAME || 'Donza',
      currentYear: new Date().getFullYear()
    });

    // Configuração do email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM || 'noreply@donza.com'}>`,
      to: email,
      subject: 'Complete seu registro - Donza',
      html: emailHtml,
      text: `Olá ${email},\n\nPor favor, complete seu registro clicando no link abaixo:\n\n${verificationUrl}\n\nO link expirará em 24 horas.\n\nAtenciosamente,\nEquipe Donza`
    };

    // Envia o email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email de verificação enviado para ${email}: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('Erro ao enviar email de verificação:', error instanceof Error ? error.message : error);
    throw new BadRequestError('Falha ao enviar email de verificação');
  }
};

/**
 * Envia email de confirmação de registro completo
 * @param {Object} user - Usuário registrado
 */
const sendRegistrationCompleteEmail = async (user) => {
  try {
    // Renderiza o template
    const emailHtml = emailTemplates['welcome']({
      username: user.username,
      fullName: user.fullName,
      appName: process.env.APP_NAME || 'Donza',
      loginUrl: `${process.env.FRONTEND_URL}/login`,
      dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
      supportEmail: process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com'
    });

    // Configuração do email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM || 'noreply@donza.com'}>`,
      to: user.email,
      subject: 'Bem-vindo ao Donza!',
      html: emailHtml,
      text: `Olá ${user.username},\n\nSeu cadastro foi concluído com sucesso!\n\nAgora você pode acessar sua conta em: ${process.env.FRONTEND_URL}/dashboard\n\nAtenciosamente,\nEquipe Donza`
    };

    // Envia o email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email de boas-vindas enviado para ${user.email}: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('Erro ao enviar email de boas-vindas:', error);
    throw new BadRequestError('Falha ao enviar email de confirmação');
  }
};

/**
 * Envia email de redefinição de senha
 * @param {Object} user - Usuário solicitando redefinição
 * @param {string} resetToken - Token para redefinição
 */
const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    // URL de redefinição
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Renderiza o template
    const emailHtml = emailTemplates['password-reset']({
      username: user.username,
      resetUrl,
      supportEmail: process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com',
      appName: process.env.APP_NAME || 'Donza',
      expirationHours: 1
    });

    // Configuração do email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM || 'noreply@donza.com'}>`,
      to: user.email,
      subject: 'Redefinição de senha - Donza',
      html: emailHtml,
      text: `Olá ${user.username},\n\nPara redefinir sua senha, acesse: ${resetUrl}\n\nO link expira em 1 hora.\n\nEquipe Donza`
    };

    // Envia o email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email de redefinição enviado para ${user.email}: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('Erro ao enviar email de redefinição:', error);
    throw new BadRequestError('Falha ao enviar email de redefinição');
  }
};

/**
 * Envia email de sucesso na redefinição de senha
 * @param {Object} user - Usuário solicitando redefinição
 * @param {string} resetToken - Token para redefinição
 */

const sendPasswordChangedEmail = async (user) => {
  try {
    const emailHtml = emailTemplates['password-changed']({
      username: user.username,
      fullName: user.fullName,
      appName: process.env.APP_NAME || 'Donza',
      loginUrl: `${process.env.FRONTEND_URL}/login`,
      supportEmail: process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com'
    })
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM || 'noreply@donza.com'}>`,
      to: user.email,
      subject: 'Senha alterada com sucesso',
      html: emailHtml,
      text: `Olá ${user.username},\n\nSua senha foi alterada com sucesso em ${new Date().toLocaleString('pt-BR')}.\n\n` +
            `Se você não realizou esta alteração, entre em contato com: ${process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com'}\n\n` +
            `Atenciosamente,\nEquipe ${process.env.APP_NAME || 'Donza'}`
      };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email de confirmação enviado para ${user.email}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Erro ao enviar email de confirmação:', error);
    throw new BadRequestError('Falha ao enviar email de confirmação');
  }
};

/**
 * Envia email de aprovação de conta
 * @param {string} email - Email do usuário aprovado
 * @param {string} username - Nome de usuário
 * @param {string} reviewer - Nome do revisor que aprovou a conta
 */
const sendAccountApprovedEmail = async (email, username, reviewer) => {  
  try {
    // Renderiza o template
    const emailHtml = emailTemplates['account-approved']({
      username,
      reviewer,
      appName: process.env.APP_NAME || 'Donza',
      loginUrl: `${process.env.FRONTEND_URL}/login`,
      terms: `${process.env.FRONTEND_URL}/terms`,
      privacy:  `${process.env.FRONTEND_URL}/privacy`,
      supportEmail: process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com',
      currentYear: new Date().getFullYear()
    });

    // Configuração do email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM || 'noreply@donza.com'}>`,
      to: email,
      subject: 'Sua conta foi aprovada! - Donza',
      html: emailHtml,
      text: `Olá ${username},\n\nSua conta no ${process.env.APP_NAME || 'Donza'} foi aprovada por ${reviewer}.\n\n` +
            `Agora você pode acessar todos os recursos da plataforma: ${process.env.FRONTEND_URL}/login\n\n` +
            `Atenciosamente,\nEquipe ${process.env.APP_NAME || 'Donza'}`
    };

    // Envia o email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email de aprovação enviado para ${email}: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('Erro ao enviar email de aprovação:', error instanceof Error ? error.message : error);
    throw new BadRequestError('Falha ao enviar email de aprovação');
  }
};

/**
 * Envia email de rejeição de conta
 * @param {string} email - Email do usuário rejeitado
 * @param {string} username - Nome de usuário
 * @param {string} reviewer - Nome do revisor que rejeitou a conta
 * @param {string} reason - Motivo da rejeição
 */
const sendAccountRejectedEmail = async (email, username, reviewer, reason) => {
  try {
    // Renderiza o template
    const emailHtml = emailTemplates['account-rejected']({
      username,
      reviewer,
      reason,
      appName: process.env.APP_NAME || 'Donza',
      supportEmail: process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com',
      helpUrl: "https://donza.com/ajuda",
      currentYear: new Date().getFullYear()
    });

    // Configuração do email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Donza'}" <${process.env.EMAIL_FROM || 'noreply@donza.com'}>`,
      to: email,
      subject: 'Solicitação de conta não aprovada - Donza',
      html: emailHtml,
      text: `Olá ${username},\n\nLamentamos informar que sua solicitação de conta no ${process.env.APP_NAME || 'Donza'} não foi aprovada por ${reviewer}.\n\n` +
            `Motivo: ${reason}\n\n` +
            `Se você acredita que houve um engano ou deseja mais informações, entre em contato com nosso suporte: ${process.env.SUPPORT_EMAIL || 'nordinomaviedeveloper@gmail.com'}\n\n` +
            `Atenciosamente,\nEquipe ${process.env.APP_NAME || 'Donza'}`
    };

    // Envia o email
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email de rejeição enviado para ${email}: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('Erro ao enviar email de rejeição:', error instanceof Error ? error.message : error);
    throw new BadRequestError('Falha ao enviar email de rejeição');
  }
};

module.exports = {
  sendNotificationEmail,
  sendEventNotification,
  sendTaskNotification,
  sendVerificationEmail,
  sendRegistrationCompleteEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  transporter
};