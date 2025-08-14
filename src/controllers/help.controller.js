const { Op } = require('sequelize');
const { HelpArticle, HelpFeedback, HelpCategory, User } = require('../models');
const { sequelize } = require('../configs/db');

module.exports = {
    getArticles: async (req, res, next) => {
        try {
            const { category } = req.query;
            const where = category ? { category } : {};
            
            const articles = await HelpArticle.findAll({
                where,
                order: [['updatedAt', 'DESC']],
            });
            
            res.json(articles);
            } catch (error) {
                console.error(error);
                res.status(500).json({ error: 'Erro ao buscar artigos' });
            }
    },

    createArticle: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { title, slug, category, content, excerpt, status } = req.body;
            
            if (!title || !slug || !category || !content) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Missing required fields' });
            }
            
            const existingArticle = await HelpArticle.findOne({
                where: { slug },
                transaction
            });
            
            if (existingArticle) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Slug already in use' });
            }
            
            const article = await HelpArticle.create({
                title,
                slug,
                category,
                content,
                excerpt: excerpt || null,
                status: status || 'draft',
                reviewerId: req.user?.userId
            }, { transaction });
            
            await transaction.commit();
            res.status(201).json(article);
        } catch (error) {
            await transaction.rollback();
            console.error(error);
            res.status(500).json({ error: 'Error creating article' });
        }
    },

    updateArticle: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { articleId } = req.params;
            const { title, category, content, excerpt, status } = req.body;
            
            const article = await HelpArticle.findByPk(articleId, { transaction });
            
            if (!article) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Article not found' });
            }
            
            article.title = title;
            article.category = category;
            article.content = content;
            article.excerpt = excerpt || null;
            article.status = status;
            article.lastReviewedAt = new Date();
            article.reviewerId = req.user?.userId;
            
            await article.save({ transaction });
            await transaction.commit();
            
            res.json(article);
        } catch (error) {
            await transaction.rollback();
            console.error(error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Error updating article' });
        }
    },

    deleteArticle: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { articleId } = req.params;

            // Verifica se o artigo existe
            const article = await HelpArticle.findByPk(articleId, { transaction });

            if (!article) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Article not found' });
            }

            // Remove o artigo
            await article.destroy({ transaction });

            await transaction.commit();
            res.status(200).json({ message: 'Article deleted successfully' });
        } catch (error) {
            await transaction.rollback();
            console.error(error instanceof Error ? error.message : error);
            res.status(500).json({ error: 'Error deleting article' });
        }
    },

    searchArticles: async (req, res, next) => {
        try {
            const { query } = req.query;
            
            const results = await HelpArticle.findAll({
                where: {
                    [Op.or]: [
                        { title: { [Op.iLike]: `%${query}%` } },
                        { excerpt: { [Op.iLike]: `%${query}%` } },
                        { content: { [Op.iLike]: `%${query}%` } },
                    ],
                },
                order: [
                // Prioriza correspondências no título
                sequelize.literal(`CASE WHEN title ILIKE '%${query}%' THEN 0 ELSE 1 END`),
                    ['updatedAt', 'DESC'],
                ],
                limit: 10,
            });
        
            res.json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro na busca' });
        }
    },

    getArticleBySlug: async (req, res, next) => {
        try {
            const article = await HelpArticle.findOne({ 
                where: { slug: req.params.slug },
                include: [
                    {
                    model: HelpCategory,
                    as: 'categoryInfo',
                    attributes: ['name', 'description', 'icon'],
                    },
                ],
            });
            
              if (!article) {
                return res.status(404).json({ error: 'Artigo não encontrado' });
              }
              
              // Incrementar contador de visualizações
              await article.increment('viewCount');
              
              // Artigos relacionados
              const relatedArticles = await HelpArticle.findAll({
                where: {
                  category: article.category,
                  articleId: { [Op.ne]: article.articleId },
                },
                limit: 4,
                order: [['viewCount', 'DESC']],
              });
              
              res.json({ 
                article: article.toJSON(),
                relatedArticles: relatedArticles.map(a => a.toJSON()),
              });
            } catch (error) {
              console.error(error);
              res.status(500).json({ error: 'Erro ao buscar artigo' });
            }
    },

    getPopularTopics: async (req, res, next) => {
        try {
            const topics = await HelpArticle.findAll({
                order: [['viewCount', 'DESC']],
                limit: 5,
                attributes: ['articleId', 'title', 'slug'],
            });
            
            res.json(topics);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar tópicos' });
        }
    },

    getCategories: async (req, res, next) => {
        try {
            const categories = await HelpCategory.findAll({
                where: { isActive: true },
                order: [['displayOrder', 'ASC']],
                include: [{
                model: HelpArticle,
                as: 'articles',
                attributes: [],
                }],
                attributes: [
                'id',
                'name',
                'description',
                'icon',
                [sequelize.fn('COUNT', sequelize.col('articles.articleId')), 'articleCount'],
                ],
                group: ['HelpCategory.id'],
            });
        
            res.json(categories);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar categorias' });
        }
    },

    sendFeedback: async (req, res, next) => {
        console.log("COMMING FEEDBACK: ", req.body);
        try {
            const { articleId, wasHelpful, comment } = req.body;
            
            const article = await HelpArticle.findByPk(articleId);
            if (!article) {
                return res.status(404).json({ error: 'Article not found' });
            }
            
            const existingFeedback = await HelpFeedback.findOne({
                where: { 
                    userId: req.user.userId,
                    articleId,
                },
            });
            
            if (existingFeedback) {
                return res.status(400).json({ error: 'You have already submitted feedback for this article' });
            }
            
            const feedback = await HelpFeedback.create({
                userId: req.user.userId,
                articleId,
                wasHelpful,
                comment: comment || null,
            });
            
            await article.update({
                feedbackCount: sequelize.literal('"feedbackCount" + 1'),
                helpfulCount: wasHelpful 
                    ? sequelize.literal('"helpfulCount" + 1') 
                    : sequelize.literal('"helpfulCount"'),
            });
            
            await article.reload();
            const newRating = (article.helpfulCount / article.feedbackCount) * 5;
            await article.update({ rating: newRating });
            
            res.json({ success: true, feedback });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error submitting feedback' });
        }
    },

    getFeedbackList: async (req, res, next) => {
        try {
            const feedbacks = await HelpFeedback.findAll({
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'email']
                    },
                    {
                        model: HelpArticle,
                        as: 'article',
                        attributes: ['articleId', 'title']
                    }
                ],
                order: [['createdAt', 'DESC']],
            });
            
            res.json(feedbacks);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error fetching feedback list' });
        }
    }


}