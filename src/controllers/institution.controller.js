const { Op } = require('sequelize');
const moment = require('moment');
const {
  User,
  Course,
  Enrollment,
  Certificate,
  InstitutionInstructor,
  Activity,
  Review
} = require('../models');
const { sequelize } = require('../configs/db');


/**
 * Calcula a taxa de engajamento dos estudantes
 */
async function calculateEngagementRate(userId, models, dateFilter = {}) {
  try {
    // Total de estudantes únicos
    const totalStudents = await models.Enrollment.count({
      distinct: true,
      col: 'userId',
      include: [{
        model: models.Course,
        where: { organizerId: userId },
        attributes: []
      }],
      where: dateFilter
    });

    if (!totalStudents) return 0;

    // Estudantes com atividade recente (últimos 7 dias)
    const activeStudents = await models.Activity.count({
      distinct: true,
      col: 'userId',
      where: {
        entityType: 'course',
        '$course.organizerId$': userId,
        createdAt: {
          [Op.gte]: moment().subtract(7, 'days').toDate()
        }
      },
      include: [{
        model: models.Course,
        attributes: [],
        required: true
      }]
    });

    return Math.round((activeStudents / totalStudents) * 100);
  } catch (error) {
    console.error('Error calculating engagement rate:', error);
    return 0;
  }
}

/**
 * Formata dados analíticos para resposta
 */
function formatAnalyticsData(rawData) {
  return {
    labels: rawData.map(item => item.label),
    datasets: [{
      label: 'Performance',
      data: rawData.map(item => item.value),
      backgroundColor: '#3b82f6',
      borderColor: '#2563eb',
      borderWidth: 2
    }]
  };
}

/**
 * Middleware de cache simplificado
 */
function cacheResponse(duration) {
  return (req, res, next) => {
    const key = req.originalUrl || req.url;
    const cacheStore = req.app.get('cacheStore');
    
    if (cacheStore) {
      const cachedData = cacheStore.get(key);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        cacheStore.set(key, body, duration);
        originalJson(body);
      };
    }
    
    next();
  };
}

module.exports = {
  /**
   * Obtém estatísticas gerais da instituição
   */
  getInstitutionStats: async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      // Validação básica de datas
      const dateFilter = {};
      if (startDate && endDate) {
        if (!moment(startDate).isValid() || !moment(endDate).isValid()) {
          return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD' });
        }
        dateFilter.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
      }

      const [
        totalStudents,
        activeCourses,
        enrollmentsData,
        certificatesData,
        topCourses
      ] = await Promise.all([
        Enrollment.count({
          distinct: true,
          col: 'userId',
          include: [{
            model: Course,
            as: 'course',
            where: { organizerId: userId },
            attributes: []
          }],
          where: dateFilter
        }),

        // Cursos ativos
        Course.count({
          where: {
            organizerId: userId,
            status: 'published',
            ...dateFilter
          }
        }),

        // Dados de matrículas para cálculo de taxas
        Enrollment.findAll({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('enrollmentId')), 'totalEnrollments'],
            [sequelize.fn('AVG', sequelize.col('progress')), 'avgProgress'],
            [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']
          ],
          include: [{
            model: Course,
            as: 'course',
            where: { organizerId: userId },
            attributes: []
          }],
          where: dateFilter,
          raw: true
        }),

        // Certificados emitidos
        Certificate.count({
          include: [{
            model: Course,
            as: 'course',
            where: { organizerId: userId },
            attributes: []
          }],
          where: dateFilter
        }),

        // Top 5 cursos por avaliação
        Course.findAll({
          where: {
            organizerId: userId,
            status: 'published',
            ratingCount: { [Op.gt]: 0 }
          },
          attributes: [
            'courseId',
            'title',
            'description',
            'ratingAverage',
            [sequelize.fn('COUNT', sequelize.col('enrollments.enrollmentId')), 'enrollmentsCount']
          ],
          include: [{
            model: Enrollment,
            as: 'enrollments',
            attributes: [],
            required: false
          }],
          group: ['Course.courseId'],
          order: [['ratingAverage', 'DESC']],
          limit: 5,
          subQuery: false
        })
      ]);

      const completionRate = enrollmentsData[0]?.avgProgress ?
        Math.round(parseFloat(enrollmentsData[0].avgProgress)) : 0;

      const satisfactionRate = enrollmentsData[0]?.avgRating ?
        parseFloat(enrollmentsData[0].avgRating).toFixed(1) : 0;

      const engagementRate = await calculateEngagementRate(userId, { Enrollment, Course, Activity }, dateFilter);

      return res.json({
        totalStudents: totalStudents || 0,
        activeCourses: activeCourses || 0,
        completionRate,
        satisfactionRate,
        certificatesIssued: certificatesData || 0,
        performance: {
          averageCompletion: completionRate,
          averageRating: satisfactionRate,
          engagementRate
        },
        topCourses: topCourses.map(course => ({
          id: course.courseId,
          title: course.title,
          category: course.category,
          enrollments: course.dataValues.enrollmentsCount,
          completionRate: course.metrics?.completionRate || 0,
          rating: course.ratingAverage,
          reviews: course.ratingCount,
          status: course.status
        }))
      });

    } catch (error) {
      console.error('Error fetching institution stats:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém matrículas recentes
   */
  getRecentEnrollments: async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit) || 10;

      const enrollments = await Enrollment.findAll({
        where: { '$course.organizerId$': userId },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['userId', 'fullName']
          },
          {
            model: Course,
            as: 'course',
            attributes: ['courseId', 'title'],
            where: { organizerId: userId }
          }
        ],
        order: [['createdAt', 'DESC']],
        limit
      });

      const formattedEnrollments = enrollments.map(enroll => ({
        id: enroll.enrollmentId,
        studentName: enroll.student?.fullName || 'Aluno desconhecido',
        courseName: enroll.course?.title || 'Curso desconhecido',
        date: moment(enroll.createdAt).format('YYYY-MM-DD'),
        status: enroll.status
      }));

      return res.json(formattedEnrollments);
    } catch (error) {
      console.error('Error fetching recent enrollments:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém lista de instrutores
   */
  getInstitutionInstructors: async (req, res) => {
    try {
      const { userId } = req.params;

      const instructors = await User.findAll({
        where: {
          role: 'instructor',
          '$taughtCourses.organizerId$': userId
        },
        include: [{
          model: Course,
          as: 'taughtCourses',
          attributes: [],
          where: { organizerId: userId }
        }],
        attributes: [
          'userId',
          'fullName',
          'avatarUrl',
          'expertise',
          [sequelize.fn('COUNT', sequelize.col('taughtCourses.courseId')), 'coursesCount'],
          [sequelize.literal(`(
            SELECT COUNT(DISTINCT "enrollments"."userId")
            FROM "enrollments"
            JOIN "courses" ON "enrollments"."courseId" = "courses"."courseId"
            WHERE "courses"."instructorId" = "User"."userId"
            AND "courses"."organizerId" = '${userId}'
          )`), 'studentsCount'],
          [sequelize.literal(`(
            SELECT AVG("reviews"."rating")
            FROM "reviews"
            JOIN "courses" ON "reviews"."courseId" = "courses"."courseId"
            WHERE "courses"."instructorId" = "User"."userId"
            AND "courses"."organizerId" = '${userId}'
            AND "reviews"."rating" IS NOT NULL
          )`), 'rating']
        ],
        group: ['User.userId'],
        order: [[sequelize.literal('rating'), 'DESC']]
      });

      const formattedInstructors = instructors.map(instructor => ({
        id: instructor.userId,
        name: instructor.fullName,
        avatar: instructor.avatarUrl,
        expertise: instructor.expertise || [],
        courses: instructor.dataValues.coursesCount,
        students: instructor.dataValues.studentsCount,
        rating: parseFloat(instructor.dataValues.rating || 0).toFixed(1)
      }));

      return res.json(formattedInstructors);
    } catch (error) {
      console.error('Error fetching institution instructors:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém dados completos da instituição
   */
  getInstitutionData: async (req, res) => {
    try {
      const { userId } = req.params;

      const institution = await User.findByPk(userId, {
        attributes: [
          'userId',
          'institutionName',
          'email',
          'avatarUrl',
          'website',
          'bio',
          'primaryColor',
          'secondaryColor'
        ],
        include: [{
          model: Course,
          as: 'organizedCourses',
          attributes: ['courseId', 'title', 'status'],
          limit: 5,
          order: [['createdAt', 'DESC']]
        }]
      });

      if (!institution) {
        return res.status(404).json({ error: 'Institution not found' });
      }

      // Obter informações de faturamento
      const billingInfo = {
        plan: 'premium',
        status: 'active',
        nextBillingDate: moment().add(1, 'month').format('YYYY-MM-DD')
      };

      return res.json({
        id: institution.userId,
        name: institution.institutionName,
        email: institution.email,
        logo: institution.avatarUrl,
        primaryColor: institution.primaryColor || '#3b82f6',
        secondaryColor: institution.secondaryColor || '#10b981',
        website: institution.website,
        description: institution.bio,
        recentCourses: institution.organizedCourses,
        billingInfo
      });
    } catch (error) {
      console.error('Error fetching institution data:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém dados analíticos com tendências
   */
  getInstitutionAnalytics: cacheResponse('5 minutes'),
  _getInstitutionAnalytics: async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate = moment().subtract(30, 'days').format('YYYY-MM-DD'),
        endDate = moment().format('YYYY-MM-DD') } = req.query;

      // Validação de datas
      if (!moment(startDate).isValid() || !moment(endDate).isValid()) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Obter métricas gerais
      const [metrics, trends] = await Promise.all([
        this._getGeneralMetrics(userId, startDate, endDate),
        this._getTrendsData(userId, startDate, endDate)
      ]);

      return res.json({
        total_students: metrics.totalStudents,
        active_students: metrics.activeStudents,
        completion_rate: metrics.completionRate,
        avg_study_time: metrics.avgStudyTime,
        satisfaction_rate: metrics.satisfactionRate,
        trends
      });
    } catch (error) {
      console.error('Error fetching institution analytics:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Método auxiliar para obter métricas gerais
   */
  async _getGeneralMetrics(userId, startDate, endDate) {
    const dateFilter = {
      createdAt: {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      }
    };

    const [
      totalStudents,
      activeStudents,
      completionData,
      ratingData,
      studyTimeData
    ] = await Promise.all([
      Enrollment.count({
        distinct: true,
        col: 'userId',
        include: [{
          model: Course,
          where: { organizerId: userId },
          attributes: []
        }],
        where: dateFilter
      }),

      // Estudantes ativos
      Activity.count({
        distinct: true,
        col: 'userId',
        where: {
          entityType: 'course',
          '$course.organizerId$': userId,
          createdAt: dateFilter.createdAt
        },
        include: [{
          model: Course,
          attributes: [],
          required: true
        }]
      }),

      // Dados de conclusão
      Enrollment.findAll({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('progress')), 'avgProgress']
        ],
        include: [{
          model: Course,
          where: { organizerId: userId },
          attributes: []
        }],
        where: dateFilter,
        raw: true
      }),

      // Avaliações
      Review.findAll({
        attributes: [
          [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']
        ],
        include: [{
          model: Course,
          where: { organizerId: userId },
          attributes: []
        }],
        where: dateFilter,
        raw: true
      }),

      // Tempo de estudo
      Promise.resolve({ avgStudyTime: 8.5 })
    ]);

    return {
      totalStudents: totalStudents || 0,
      activeStudents: activeStudents || 0,
      completionRate: completionData[0]?.avgProgress ?
        Math.round(parseFloat(completionData[0].avgProgress)) : 0,
      satisfactionRate: ratingData[0]?.avgRating ?
        parseFloat(ratingData[0].avgRating).toFixed(1) : 0,
      avgStudyTime: studyTimeData.avgStudyTime
    };
  },

  /**
   * Método auxiliar para obter dados de tendências
   */
  _getTrendsData: async (userId, startDate, endDate) => {
    const dateRange = [];
    let currentDate = moment(startDate);
    const end = moment(endDate);

    while (currentDate <= end) {
      dateRange.push(currentDate.format('YYYY-MM-DD'));
      currentDate = currentDate.add(1, 'day');
    }

    // Obter dados agregados por dia
    const dailyData = await Enrollment.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('Enrollment.createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('Enrollment.enrollmentId')), 'enrollments'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "progress" = 100 THEN 1 ELSE 0 END')), 'completions'],
        [sequelize.fn('AVG', sequelize.col('progress')), 'avgProgress']
      ],
      include: [{
        model: Course,
        where: { organizerId: userId },
        attributes: []
      }],
      where: {
        createdAt: { [Op.between]: [new Date(startDate), new Date(endDate)] }
      },
      group: ['date'],
      order: [['date', 'ASC']],
      raw: true
    });

    // Formatando para incluir todos os dias no intervalo
    return dateRange.map(date => {
      const dayData = dailyData.find(d => moment(d.date).format('YYYY-MM-DD') === date) || {};
      return {
        date,
        active_students: dayData.enrollments || 0,
        completions: dayData.completions || 0,
        avg_study_time: 8.5,
        completion_rate: dayData.avgProgress ? Math.round(dayData.avgProgress) : 0
      };
    });
  },

  /**
   * Obtém cursos com melhor desempenho
   */
  getTopCourses: async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 5, sortBy = 'rating' } = req.query;

      const validSortFields = ['rating', 'enrollments', 'completion'];
      if (!validSortFields.includes(sortBy)) {
        return res.status(400).json({ error: 'Invalid sort field' });
      }

      const order = [];
      if (sortBy === 'rating') {
        order.push(['ratingAverage', 'DESC']);
      } else if (sortBy === 'enrollments') {
        order.push([sequelize.literal('enrollmentsCount'), 'DESC']);
      } else {
        order.push(['metrics.completionRate', 'DESC']);
      }

      const topCourses = await Course.findAll({
        where: {
          organizerId: userId,
          status: 'published'
        },
        attributes: [
          'courseId',
          'title',
          'description',
          'ratingAverage',
          'ratingCount',
          'metrics.completionRate',
          [sequelize.fn('COUNT', sequelize.col('enrollments.enrollmentId')), 'enrollmentsCount']
        ],
        include: [{
          model: Enrollment,
          as: 'enrollments',
          attributes: [],
          required: false
        }],
        group: ['Course.courseId'],
        order,
        limit: parseInt(limit),
        subQuery: false
      });

      return res.json(topCourses.map(course => ({
        id: course.courseId,
        title: course.title,
        enrollments: course.dataValues.enrollmentsCount,
        completionRate: course.metrics?.completionRate || 0,
        rating: course.ratingAverage,
        reviews: course.ratingCount
      })));
    } catch (error) {
      console.error('Error fetching top courses:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém cursos da instituição
   */
  getInstitutionCourses: async (req, res) => {
    try {
      const { userId } = req.params;
      const { status, page = 1, limit = 10 } = req.query;

      const where = { organizerId: userId };
      if (status) where.status = status;

      const { count, rows } = await Course.findAndCountAll({
        where,
        attributes: [
          'courseId',
          'title',
          'status',
          'createdAt',
          'ratingAverage',
          'ratingCount',
          [sequelize.fn('COUNT', sequelize.col('enrollments.enrollmentId')), 'enrollmentsCount']
        ],
        include: [{
          model: Enrollment,
          attributes: [],
          required: false
        }],
        group: ['Course.courseId'],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: (page - 1) * limit,
        subQuery: false
      });

      return res.json({
        total: count.length,
        page: parseInt(page),
        totalPages: Math.ceil(count.length / limit),
        courses: rows.map(course => ({
          id: course.courseId,
          title: course.title,
          status: course.status,
          createdAt: course.createdAt,
          enrollments: course.dataValues.enrollmentsCount,
          rating: course.ratingAverage,
          reviews: course.ratingCount
        }))
      });
    } catch (error) {
      console.error('Error fetching institution courses:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  getInstitutionCertificates: async (req, res) => {
    try {
      const { userId } = req.user;

      const checkUser = await User.findByPk(userId);

      if (!checkUser) {
        return res.json({
          message: 'User does not exist'
        })
      }

      const certificates = await Certificate.findAll({
        where: {
          userId
        }
      })

      res.status(200).json(certificates)

    } catch (error) {
      console.log("Error getting certificates: ", error instanceof Error ? error.message : error);
    }
  },

  /**
   * Cria um novo curso para a instituição
   */
  createCourse: async (req, res) => {
    try {
      const { userId } = req.params;
      const { title, description, category, level } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: 'Title and description are required' });
      }

      const newCourse = await Course.create({
        title,
        description,
        category,
        level: level || 'beginner',
        organizerId: userId,
        instructorId: userId,
        status: 'draft'
      });

      return res.status(201).json({
        id: newCourse.courseId,
        title: newCourse.title,
        status: newCourse.status,
        message: 'Course created successfully. You can now add modules and lessons.'
      });
    } catch (error) {
      console.error('Error creating course:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém membros da instituição
   */
  getInstitutionMembers: async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, page = 1, limit = 20 } = req.query;

      // Obter instrutores associados aos cursos da instituição
      const instructors = await User.findAll({
        where: {
          role: 'instructor',
          '$taughtCourses.organizerId$': userId
        },
        include: [{
          model: Course,
          as: 'taughtCourses',
          attributes: [],
          where: { organizerId: userId }
        }],
        attributes: [
          'userId',
          'fullName',
          'email',
          'avatarUrl',
          'role',
          'createdAt',
          [sequelize.fn('COUNT', sequelize.col('taughtCourses.courseId')), 'coursesCount']
        ],
        group: ['User.userId'],
        order: [['createdAt', 'DESC']]
      });

      // Obter estudantes matriculados nos cursos da instituição
      const students = await User.findAll({
        where: {
          role: 'student',
          '$enrolledCourses.organizerId$': userId
        },
        include: [{
          model: Course,
          as: 'enrolledCourses',
          attributes: [],
          where: { organizerId: userId }
        }],
        attributes: [
          'userId',
          'fullName',
          'email',
          'avatarUrl',
          'role',
          'createdAt',
          [sequelize.fn('COUNT', sequelize.col('enrolledCourses.courseId')), 'coursesCount']
        ],
        group: ['User.userId'],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: (page - 1) * limit,
        subQuery: false
      });

      // Contagem total de estudantes
      const totalStudents = await User.count({
        where: {
          role: 'student',
          '$enrolledCourses.organizerId$': userId
        },
        include: [{
          model: Course,
          as: 'enrolledCourses',
          attributes: [],
          where: { organizerId: userId }
        }],
        distinct: true,
        col: 'userId'
      });

      return res.json({
        instructors: instructors.map(instructor => ({
          id: instructor.userId,
          name: instructor.fullName,
          email: instructor.email,
          avatar: instructor.avatarUrl,
          role: instructor.role,
          joinedAt: instructor.createdAt,
          courses: instructor.dataValues.coursesCount
        })),
        students: {
          total: totalStudents,
          page: parseInt(page),
          totalPages: Math.ceil(totalStudents / limit),
          data: students.map(student => ({
            id: student.userId,
            name: student.fullName,
            email: student.email,
            avatar: student.avatarUrl,
            role: student.role,
            joinedAt: student.createdAt,
            courses: student.dataValues.coursesCount
          }))
        }
      });
    } catch (error) {
      console.error('Error fetching institution members:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Obtém informações de faturamento
   */
  getBillingInfo: async (req, res) => {
    try {
      const { userId } = req.params;

      // Simulando dados de faturamento - integrar com gateway de pagamento real
      const billingInfo = {
        plan: 'premium',
        status: 'active',
        nextBillingDate: moment().add(1, 'month').format('YYYY-MM-DD'),
        paymentMethod: 'credit_card',
        cardLast4: '4242',
        monthlyPrice: 299.90,
        currency: 'BRL',
        invoices: [
          {
            id: 'inv_123',
            date: moment().subtract(1, 'month').format('YYYY-MM-DD'),
            amount: 299.90,
            status: 'paid',
            pdfUrl: '#'
          },
          {
            id: 'inv_122',
            date: moment().subtract(2, 'months').format('YYYY-MM-DD'),
            amount: 299.90,
            status: 'paid',
            pdfUrl: '#'
          }
        ]
      };

      return res.json(billingInfo);
    } catch (error) {
      console.error('Error fetching billing info:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
 * @function sendInstructorInvite
 * @description Envia convite para instrutor se juntar à instituição
 */
sendInstructorInvite: async (req, res, next) => {
  try {
    const { institutionId, instructorId, message } = req.body;

    // TODO: Verificar se o instructor ja conectado com uma instituicao

    // Verifica se já existe um convite
    const existingInvite = await InstitutionInstructor.findOne({
      where: {
        institutionId,
        instructorId
      }
    });

    if (existingInvite) {
      return res.status(400).json({
        success: false,
        message: existingInvite.status === 'pending' 
          ? 'Já existe um convite pendente para este instrutor'
          : 'Este instrutor já está vinculado à instituição'
      });
    }

    // Cria o convite
    await InstitutionInstructor.create({
      institutionId,
      instructorId,
      message,
      status: 'pending',
      invitedAt: new Date()
    });

    // TODO: Enviar notificação/email para o instrutor

    res.json({
      success: true,
      message: 'Convite enviado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao enviar convite:', error instanceof Error ? error.message : error);
    next(error);
  }
},

/**
 * @function respondToInvite
 * @description Permite ao instrutor responder a um convite
 */
respondToInvite: async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const { accepted } = req.body;
    const { userId } = req.user;

    const invite = await InstitutionInstructor.findOne({
      where: {
        id: inviteId,
        instructorId: userId,
        status: 'pending'
      }
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Convite não encontrado ou já respondido'
      });
    }

    await invite.update({
      status: accepted ? 'accepted' : 'rejected',
      respondedAt: new Date()
    });

    // TODO: Enviar notificação/email para a instituição

    res.json({
      success: true,
      message: `Convite ${accepted ? 'aceito' : 'rejeitado'} com sucesso`
    });

  } catch (error) {
    console.error('Erro ao responder convite:', error instanceof Error ? error.message : error);
    next(error);
  }
}
};