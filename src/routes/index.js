const express = require('express');
const router = express.Router();

// Importar todas as rotas
const searchRoutes = require('./search.routes.js');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const institutionRoutes = require('./institution.routes.js');
const dashboardRoutes = require('./dashboard.routes.js');
const notificationRoutes = require('./notification.routes.js');
const courseRoutes = require('./courses.routes');
const moduleRoutes = require('./modules.routes');
const lessonRoutes = require('./lessons.routes');
const eventRoutes = require('./events.routes');
const reviewsRoutes = require('./review.routes.js');
const assignmentRoutes = require('./assignment.routes.js');
const paymentsRoutes = require('./payment.routes.js');
const certificateRoutes = require('./certificate.routes.js');
const conversationRoutes = require('./message.routes');
const helpRoutes = require('./help.routes');
const testimonialRoutes = require('./testimonials.routes.js');
const adminRoutes = require('./admin.routes');

/** Communities and groups */
const communityRoutes = require('./community.routes');
const groupRoutes = require('./studyGroup.routes.js')
const taskRoutes = require('./task.routes.js');
const calendarRoutes = require('./calendar.routes.js');
const chatRoutes = require('./chat.routes.js');
const contentRoutes = require('./content.routes.js');
const discussionRoutes = require('./discussion.routes.js');
const gamificationRoutes = require('./gamification.routes.js');
// const moderationRoutes = require('./moderation.routes.js');
const reportRoutes = require('./report.routes.js');

// Rotas de pesquisa
router.use('/search', searchRoutes);

// Rotas de autenticação
router.use('/auth', authRoutes);

// Rotas de usuário
router.use('/users', userRoutes);

// Rotas da instituicao
router.use('/institution', institutionRoutes);

// Rota de dashboard
router.use('/dashboard', dashboardRoutes);

// Rota de Notificacoes
router.use('/notifications', notificationRoutes);

// Rotas de conteúdo educacional
router.use('/courses', courseRoutes);
router.use('/modules', moduleRoutes);
router.use('/lessons', lessonRoutes);

// Rotas de eventos
router.use('/events', eventRoutes);

router.use('/reviews', reviewsRoutes);

router.use('/certificates', certificateRoutes);

// Rotas de tarefas
router.use('/assignment', assignmentRoutes);

// Rotas de pagamentos
router.use('/payments', paymentsRoutes);

// Rotas de messagens
router.use('/conversation', conversationRoutes);

// Rotas de ajuda
router.use('/help', helpRoutes);

// Rotas de testemunhos
router.use('/testimonial', testimonialRoutes);

// Rotas de comunidades
router.use('/community', communityRoutes);

// Rotas de grupos de estudo
router.use('/groups', groupRoutes);

// Rotas de calendario
router.use('/calendar', calendarRoutes);

// Rotas de chat
router.use('/chat', chatRoutes);

// Rotas de conteudo
router.use('/content', contentRoutes);

// Rotas de discucao
router.use('/discussion', discussionRoutes);

// Rotas de gamificacao
router.use('/gamification', gamificationRoutes);

// Rotas de moderacao
// router.use('/moderation', moderationRoutes);

// Rotas de reportacao
router.use('/report', reportRoutes);

// Rotas de tarefas de grupo
router.use('/task', taskRoutes);

// Rotas de administracao do sistema
router.use('/admin', adminRoutes);


module.exports = router;