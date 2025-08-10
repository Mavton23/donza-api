const { Course, Enrollment, Review, User, Lesson, UserLesson, Module } = require('../models');
const { sequelize } = require('../configs/db');
const { Op, Sequelize, QueryTypes } = require('sequelize');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { ROLES } = require('../constants/constants');
const moment = require('moment');

// Cache simples para métricas
const metricsCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

module.exports = {
  /**
   * Métricas administrativas globais
   */
  getAdminMetrics: async (req, res, next) => {
    try {
      const cacheKey = 'admin_metrics';
      const cached = metricsCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return res.json({ success: true, data: cached.data });
      }

      const [
        totals,
        growth,
        popularCourses,
        recentReviews,
        userActivity
      ] = await Promise.all([
        getPlatformTotals(),
        getGrowthMetrics(),
        getPopularCourses(5),
        getRecentReviews(5),
        getUserActivityStats()
      ]);

      const metrics = {
        platform: totals,
        growth,
        content: {
          courses: popularCourses,
          reviews: recentReviews
        },
        users: userActivity,
        updatedAt: new Date()
      };

      metricsCache.set(cacheKey, {
        data: metrics,
        timestamp: Date.now()
      });

      res.json({ success: true, data: metrics });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Métricas detalhadas por curso
   */
  getCourseMetrics: async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const userId = req.user.userId;

      // Verificação de acesso
      if (req.user.role === ROLES.INSTRUCTOR) {
        const hasAccess = await Course.count({
          where: { 
            courseId,
            instructorId: userId 
          },
          attributes: ['courseId'],
          raw: true
        });
        if (!hasAccess) throw new ForbiddenError('Acesso não autorizado');
      }

      const [
        overview,
        students,
        lessons,
        reviews,
        timeline
      ] = await Promise.all([
        getCourseOverview(courseId),
        getCourseStudents(courseId),
        getLessonMetrics(courseId),
        getReviewAnalytics(courseId),
        getEnrollmentTimeline(courseId)
      ]);

      res.json({
        success: true,
        data: {
          overview,
          students,
          lessons,
          reviews,
          timeline,
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Métricas de desempenho do instrutor
   */
  getInstructorMetrics: async (req, res, next) => {
    try {
      const { instructorId } = req.params;
      const userId = req.user.userId;

      if (req.user.role === ROLES.INSTRUCTOR && userId !== instructorId) {
        throw new ForbiddenError('Acesso não autorizado');
      }

      const [
        profile,
        courses,
        earnings,
        engagement
      ] = await Promise.all([
        getInstructorProfile(instructorId),
        getInstructorCoursesMetrics(instructorId),
        getEarnings(instructorId),
        getInstructorEngagement(instructorId)
      ]);

      res.json({
        success: true,
        data: {
          profile,
          courses,
          earnings,
          engagement,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
 * @swagger
 * /instructor/analytics:
 *   get:
 *     summary: Get analytics data for instructor dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: ['7days', '30days', '90days']
 *           default: '30days'
 *         description: Time range for analytics data
 *     responses:
 *       200:
 *         description: Analytics data for instructor dashboard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InstructorAnalytics'
 */
  getInstructorAnalytics: async (req, res, next) => {
    try {
      const { range = '30days' } = req.query;
      const instructorId = req.user.userId;
      
      // Calcular datas baseadas no range
      const ranges = {
        '7days': moment().subtract(7, 'days').toDate(),
        '30days': moment().subtract(30, 'days').toDate(),
        '90days': moment().subtract(90, 'days').toDate()
      };
      const startDate = ranges[range] || ranges['30days'];

      // Obter métricas básicas
      const [totalStudents, totalEnrollments, averageRating, completionRate] = await Promise.all([
        // Total de estudantes únicos nos cursos do instrutor
        User.count({
          distinct: true,
          col: 'userId',
          include: [{
            model: Course,
            as: 'enrolledCourses',
            where: { instructorId },
            attributes: []
          }]
        }),
        
        // Total de matrículas nos cursos do instrutor
        Enrollment.count({
          include: [{
            model: Course,
            as: 'course',
            where: { instructorId },
            attributes: []
          }]
        }),
        
        // Média de avaliações dos cursos do instrutor
        Review.findOne({
          attributes: [
            [Sequelize.fn('AVG', Sequelize.col('rating')), 'avgRating']
          ],
          include: [{
            model: Course,
            as: 'course',
            where: { instructorId },
            attributes: []
          }],
          raw: true
        }),
        
        // Taxa de conclusão média dos cursos
        Enrollment.findOne({
          attributes: [
            [Sequelize.fn('AVG', Sequelize.literal('CASE WHEN "completedAt" IS NOT NULL THEN 1 ELSE 0 END')), 'completionRate']
          ],
          include: [{
            model: Course,
            as: 'course',
            where: { instructorId },
            attributes: []
          }],
          raw: true
        })
      ]);

      // Matrículas ao longo do tempo
      const enrollmentsOverTime = await sequelize.query(
      `SELECT 
         DATE(e."createdAt") AS date,
         COUNT(e."enrollmentId") AS enrollments
       FROM "enrollments" AS e
       INNER JOIN "courses" AS c ON e."courseId" = c."courseId"
       WHERE c."instructorId" = :instructorId
         AND e."createdAt" >= :startDate
       GROUP BY DATE(e."createdAt")
       ORDER BY DATE(e."createdAt") ASC`,
      {
        replacements: { instructorId, startDate },
        type: sequelize.QueryTypes.SELECT
      }
    );

      // Cursos mais populares
      const topCourses = await sequelize.query(
      `SELECT 
         c."courseId" AS id,
         c."title" AS title,
         COUNT(e."enrollmentId") AS enrollments
       FROM "courses" AS c
       LEFT JOIN "enrollments" AS e ON c."courseId" = e."courseId"
       WHERE c."instructorId" = :instructorId
       GROUP BY c."courseId"
       ORDER BY enrollments DESC
       LIMIT 5`,
      {
        replacements: { instructorId },
        type: sequelize.QueryTypes.SELECT
      }
    );

      // Demográficos dos estudantes
      const [studentDemographics, totalResult] = await Promise.all([
        Enrollment.findAll({
          attributes: [
            [Sequelize.fn('COUNT', Sequelize.col('user.userId')), 'count'],
            [Sequelize.col('user.role'), 'category']
          ],
          include: [
            {
              model: User,
              as: 'user',
              attributes: [],
              where: {
                role: { [Op.not]: null }
              }
            },
            {
              model: Course,
              as: 'course',
              where: { instructorId },
              attributes: []
            }
          ],
          group: ['user.role'],
          order: [[Sequelize.literal('count'), 'DESC']],
          limit: 5,
          raw: true
        }),
        User.count({
          distinct: true,
          col: 'userId',
          include: [{
            model: Course,
            as: 'enrolledCourses',
            where: { instructorId },
            attributes: []
          }]
        })
      ]);

      // Formatar os dados para o frontend
      const response = {
        totalStudents,
        totalEnrollments,
        averageRating: parseFloat(averageRating?.avgRating || 0).toFixed(1),
        completionRate: Math.round((completionRate?.completionRate || 0) * 100),
        enrollmentsOverTime: enrollmentsOverTime.map(item => ({
          date: moment(item.date).format('MMM D'),
          enrollments: item.enrollments
        })),
        topCourses: topCourses.map(course => ({
          id: course.courseId,
          title: course.title,
          enrollments: course.enrollments
        })),
        studentDemographics: studentDemographics.map(item => ({
        category: item.category,
        value: Math.round((parseInt(item.count) / totalStudents) * 100)
        }))
      };

      res.json(response);
    } catch (error) {
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      next(error);
    }
  }
};

// ================
// FUNÇÕES AUXILIARES
// ================

/**
 * Métricas agregadas da plataforma
 */
async function getPlatformTotals() {
  const [results, userGrowth] = await Promise.all([
    sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM courses WHERE status = 'published') AS published_courses,
        (SELECT COUNT(*) FROM enrollments) AS total_enrollments,
        (SELECT COUNT(*) FROM users WHERE role = 'instructor') AS total_instructors
    `, { type: QueryTypes.SELECT }),
    
    sequelize.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days') AS previous_30_days
      FROM users
    `, { type: QueryTypes.SELECT })
  ]);

  const growthRate = userGrowth[0].previous_30_days > 0 
    ? ((userGrowth[0].last_30_days - userGrowth[0].previous_30_days) / userGrowth[0].previous_30_days * 100)
    : 100;

  return {
    ...results[0],
    userGrowthRate: parseFloat(growthRate.toFixed(1))
  };
}

/**
 * Crescimento mensal da plataforma
 */
async function getGrowthMetrics() {
  const results = await sequelize.query(`
    SELECT
      DATE_TRUNC('month', created_at) AS month,
      COUNT(*) AS users,
      (SELECT COUNT(*) FROM courses 
       WHERE DATE_TRUNC('month', created_at) = month) AS courses,
      (SELECT COUNT(*) FROM enrollments 
       WHERE DATE_TRUNC('month', created_at) = month) AS enrollments
    FROM users
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY month
    ORDER BY month ASC
  `, { type: QueryTypes.SELECT });

  return results.map(r => ({
    month: moment(r.month).format('MMM YYYY'),
    users: parseInt(r.users),
    courses: parseInt(r.courses),
    enrollments: parseInt(r.enrollments)
  }));
}

/**
 * Cursos mais populares (matrículas e avaliações)
 */
async function getPopularCourses(limit = 5) {
  return sequelize.query(`
    SELECT 
      c.course_id,
      c.title,
      c.rating_average,
      COUNT(e.enrollment_id) AS enrollments,
      (SELECT COUNT(*) FROM reviews r 
       WHERE r.course_id = c.course_id AND r.is_approved = true) AS reviews
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.course_id
    WHERE c.status = 'published'
    GROUP BY c.course_id
    ORDER BY enrollments DESC, rating_average DESC
    LIMIT :limit
  `, {
    replacements: { limit },
    type: QueryTypes.SELECT
  });
}

/**
 * Visão geral de um curso específico
 */
async function getCourseOverview(courseId) {
  const [results, completion] = await Promise.all([
    sequelize.query(`
      SELECT
        COUNT(e.enrollment_id) AS enrollments,
        AVG(r.rating) AS avg_rating,
        COUNT(r.review_id) AS total_reviews,
        (SELECT COUNT(*) FROM user_lessons ul
         JOIN lessons l ON l.lesson_id = ul.lesson_id
         WHERE l.course_id = :courseId AND ul.is_completed = true) AS completed_lessons
      FROM courses c
      LEFT JOIN enrollments e ON e.course_id = c.course_id
      LEFT JOIN reviews r ON r.course_id = c.course_id AND r.is_approved = true
      WHERE c.course_id = :courseId
      GROUP BY c.course_id
    `, {
      replacements: { courseId },
      type: QueryTypes.SELECT
    }),
    
    getCompletionRate(courseId)
  ]);

  return {
    enrollments: results[0]?.enrollments || 0,
    avgRating: parseFloat(results[0]?.avg_rating) || 0,
    totalReviews: results[0]?.total_reviews || 0,
    completionRate: completion,
    totalLessons: await Lesson.count({ where: { courseId } })
  };
}

/**
 * Taxa de conclusão do curso (em %)
 */
async function getCompletionRate(courseId) {
  const result = await sequelize.query(`
    SELECT 
      AVG(ul.is_completed::int) * 100 AS completion_rate
    FROM lessons l
    JOIN user_lessons ul ON ul.lesson_id = l.lesson_id
    WHERE l.course_id = :courseId
  `, {
    replacements: { courseId },
    type: QueryTypes.SELECT
  });

  return parseFloat(result[0].completion_rate).toFixed(1);
}

/**
 * Métricas por aula (completion rate, tempo médio)
 */
async function getLessonMetrics(courseId) {
  return sequelize.query(`
    SELECT
      l.lesson_id,
      l.title,
      l.lesson_type,
      AVG(ul.is_completed::int) * 100 AS completion_rate,
      AVG(EXTRACT(EPOCH FROM (ul.completed_at - ul.started_at))) AS avg_time_seconds
    FROM lessons l
    LEFT JOIN user_lessons ul ON ul.lesson_id = l.lesson_id
    WHERE l.course_id = :courseId
    GROUP BY l.lesson_id
    ORDER BY l.position ASC
  `, {
    replacements: { courseId },
    type: QueryTypes.SELECT
  }).then(results => 
    results.map(r => ({
      ...r,
      completion_rate: parseFloat(r.completion_rate).toFixed(1),
      avg_time: r.avg_time_seconds 
        ? `${Math.floor(r.avg_time_seconds / 60)}m ${Math.floor(r.avg_time_seconds % 60)}s`
        : null
    }))
  );
}

/**
 * Análise de avaliações (distribuição, tendências)
 */
async function getReviewAnalytics(courseId) {
  const [distribution, recent] = await Promise.all([
    sequelize.query(`
      SELECT
        rating,
        COUNT(*) AS count
      FROM reviews
      WHERE course_id = :courseId AND is_approved = true
      GROUP BY rating
      ORDER BY rating DESC
    `, {
      replacements: { courseId },
      type: QueryTypes.SELECT
    }),
    
    sequelize.query(`
      SELECT
        r.rating,
        r.comment,
        r.created_at,
        u.username,
        u.avatar_url
      FROM reviews r
      JOIN users u ON u.user_id = r.user_id
      WHERE r.course_id = :courseId AND r.is_approved = true
      ORDER BY r.created_at DESC
      LIMIT 5
    `, {
      replacements: { courseId },
      type: QueryTypes.SELECT
    })
  ]);

  return {
    distribution: Array.from({ length: 5 }, (_, i) => {
      const rating = 5 - i;
      const found = distribution.find(d => d.rating == rating);
      return {
        rating,
        count: found ? parseInt(found.count) : 0
      };
    }),
    recent
  };
}

/**
 * Linha do tempo de matrículas
 */
async function getEnrollmentTimeline(courseId) {
  return sequelize.query(`
    SELECT
      DATE_TRUNC('week', e.created_at) AS week,
      COUNT(*) AS enrollments
    FROM enrollments e
    WHERE e.course_id = :courseId
    GROUP BY week
    ORDER BY week ASC
  `, {
    replacements: { courseId },
    type: QueryTypes.SELECT
  });
}

/**
 * Perfil do instrutor (estatísticas básicas)
 */
async function getInstructorProfile(instructorId) {
  return sequelize.query(`
    SELECT
      u.username,
      u.avatar_url,
      u.bio,
      COUNT(DISTINCT c.course_id) AS total_courses,
      COUNT(DISTINCT e.enrollment_id) AS total_enrollments,
      AVG(c.rating_average) AS avg_course_rating
    FROM users u
    LEFT JOIN courses c ON c.instructor_id = u.user_id AND c.status = 'published'
    LEFT JOIN enrollments e ON e.course_id = c.course_id
    WHERE u.user_id = :instructorId
    GROUP BY u.user_id
  `, {
    replacements: { instructorId },
    type: QueryTypes.SELECT
  }).then(results => results[0]);
}

/**
 * Métricas por curso do instrutor
 */
async function getInstructorCoursesMetrics(instructorId) {
  return sequelize.query(`
    SELECT
      c.course_id,
      c.title,
      c.rating_average,
      c.rating_count,
      COUNT(e.enrollment_id) AS enrollments,
      (SELECT COUNT(*) FROM user_lessons ul
       JOIN lessons l ON l.lesson_id = ul.lesson_id
       WHERE l.course_id = c.course_id AND ul.is_completed = true) AS completed_lessons
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.course_id
    WHERE c.instructor_id = :instructorId AND c.status = 'published'
    GROUP BY c.course_id
    ORDER BY enrollments DESC
  `, {
    replacements: { instructorId },
    type: QueryTypes.SELECT
  });
}

/**
 * Dados financeiros
 */
async function getEarnings(instructorId) {
  return {
    totalEarnings: 0,
    pending: 0,
    lastPayout: null,
    currency: 'BRL'
  };
}

/**
 * Engajamento geral (taxa de resposta, tempo médio)
 */
async function getInstructorEngagement(instructorId) {
  const [responseRate, avgResponseTime] = await Promise.all([
    sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE instructor_reply IS NOT NULL) AS responded,
        COUNT(*) AS total
      FROM reviews r
      JOIN courses c ON c.course_id = r.course_id
      WHERE c.instructor_id = :instructorId
    `, {
      replacements: { instructorId },
      type: QueryTypes.SELECT
    }).then(results => 
      results[0].total > 0 
        ? Math.round((results[0].responded / results[0].total) * 100)
        : 0
    ),
    
    sequelize.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (r.replied_at - r.created_at))) / 3600 AS avg_hours
      FROM reviews r
      JOIN courses c ON c.course_id = r.course_id
      WHERE c.instructor_id = :instructorId AND r.instructor_reply IS NOT NULL
    `, {
      replacements: { instructorId },
      type: QueryTypes.SELECT
    }).then(results => 
      results[0]?.avg_hours 
        ? parseFloat(results[0].avg_hours).toFixed(1)
        : null
    )
  ]);

  return {
    responseRate,
    avgResponseTime: avgResponseTime ? `${avgResponseTime}h` : 'N/A',
    lastActive: await getLastActivity(instructorId)
  };
}

/**
 * Última atividade do instrutor
 */
async function getLastActivity(instructorId) {
  const result = await sequelize.query(`
    SELECT GREATEST(
      (SELECT MAX(updated_at) FROM courses WHERE instructor_id = :instructorId),
      (SELECT MAX(replied_at) FROM reviews r JOIN courses c ON c.course_id = r.course_id 
       WHERE c.instructor_id = :instructorId)
    ) AS last_activity
  `, {
    replacements: { instructorId },
    type: QueryTypes.SELECT
  });

  return result[0]?.last_activity 
    ? moment(result[0].last_activity).fromNow()
    : 'Nenhuma atividade recente';
}