const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const helpController = require('../controllers/help.controller');


// Obter todos os artigos
router.get('/articles', helpController.getArticles);

// Criar artigos
router.post('/articles', helpController.createArticle);

// Atualizar artigo
router.put('/articles/:articleId', helpController.updateArticle);

// Excluir artigo
router.delete('/articles/:articleId', helpController.deleteArticle);

// Buscar artigos
router.get('/search', helpController.searchArticles);

// Obter artigo específico
router.get('/articles/:slug', helpController.getArticleBySlug);

// Tópicos populares
router.get('/popular-topics', helpController.getPopularTopics);

// Categorias
router.get('/categories', helpController.getCategories);

// Feedback
router.get('/feedback',
    authenticate,
    helpController.getFeedbackList
);

// Enviar feedback
router.post('/feedback', 
    authenticate,
    helpController.sendFeedback
);


module.exports = router;