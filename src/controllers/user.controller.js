const bcrypt = require('bcrypt');
const { User, UserRelationship, Course, Event, EventParticipant, Activity, Lesson, Enrollment, Review } = require('../models');
const notificationService = require('../services/notification.service');
const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../configs/db')
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/file-upload.service');
const { 
  NotFoundError, 
  BadRequestError, 
  ForbiddenError
} = require('../utils/errors');

async function getRecentActivities(userId) {
  return Activity.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 10,
    include: [
      {
        model: Course,
        as: 'activityCourse',
        attributes: ['courseId', 'title', 'coverImageUrl'],
        required: false,
        where: {
          '$Activity.entityType$': 'course'
        }
      },
      {
        model: Lesson,
        as: 'lesson',
        attributes: ['lessonId', 'title', 'moduleId'],
        required: false,
        where: {
          '$Activity.entityType$': 'lesson'
        }
      },
      {
        model: Event,
        as: 'event',
        attributes: ['eventId', 'title', 'startDate'],
        required: false,
        where: {
          '$Activity.entityType$': 'event'
        }
      }
    ],
    raw: true
  }).then(activities => {
    return activities.map(activity => {
      let entityData = {};
      
      if (activity.entityType === 'course' && activity['activityCourse.courseId']) {
        entityData = {
          id: activity['activityCourse.courseId'],
          title: activity['activityCourse.title'],
          image: activity['activityCourse.coverImageUrl'],
          type: 'course'
        };
      } else if (activity.entityType === 'lesson' && activity['lesson.lessonId']) {
        entityData = {
          id: activity['lesson.lessonId'],
          title: activity['lesson.title'],
          moduleId: activity['lesson.moduleId'],
          type: 'lesson'
        };
      } else if (activity.entityType === 'event' && activity['event.eventId']) {
        entityData = {
          id: activity['event.eventId'],
          title: activity['event.title'],
          date: activity['event.startDate'],
          type: 'event'
        };
      }

      return {
        id: activity.activityId,
        type: activity.type,
        entityType: activity.entityType,
        entity: entityData,
        createdAt: activity.createdAt,
        metadata: activity.metadata || {}
      };
    });
  });
}

async function getUpcomingEvents(userId) {
  return Event.findAll({
    where: {
      startDate: { [Op.gte]: new Date() },
      status: { [Op.not]: 'canceled' }
    },
    order: [['startDate', 'ASC']],
    limit: 5
  });
}

async function getRecentResources(userId) {
  return Resource.findAll({
    where: {
      [Op.or]: [
        { createdBy: userId },
        { '$sharedWith.userId$': userId }
      ]
    },
    include: [{
      association: 'sharedWith',
      where: { userId },
      attributes: [],
      required: false
    }, {
      association: 'creator',
      attributes: ['userId', 'fullName', 'avatarUrl']
    }],
    attributes: [
      'resourceId',
      'title',
      'type',
      'createdAt',
      [sequelize.literal(`(
        SELECT COUNT(*) 
        FROM resource_downloads 
        WHERE resource_downloads.resourceId = Resource.resourceId
      )`), 'downloadCount']
    ],
    order: [['createdAt', 'DESC']],
    limit: 5
  });
}

async function getRecommendations(userId, role) {
  switch (role) {
    case 'student':
      const enrolledCourses = await Enrollment.findAll({
        where: { userId },
        attributes: ['courseId'],
        raw: true
      });
      
      const enrolledCourseIds = enrolledCourses.map(e => e.courseId);
      
      return Course.findAll({
        where: {
          courseId: { [Op.notIn]: enrolledCourseIds },
          status: 'published'
        },
        include: [{
          association: 'instructor',
          attributes: ['userId', 'fullName', 'avatarUrl']
        }],
        order: [
          ['ratingAverage', 'DESC'],
        ],
        limit: 3
      });

    case 'instructor':
      return Course.findAll({
        where: {
          instructorId: userId,
          status: 'published'
        },
        include: [{
          model: Enrollment,
          as: 'enrollments',
          attributes: [],
          required: false,
          where: { status: { [Op.not]: 'canceled' } }
        }, {
          model: Review,
          as: 'reviews',
          attributes: [],
          required: false
        }],
        attributes: [
          'courseId',
          'title',
          'ratingAverage',
          [sequelize.fn('COUNT', sequelize.col('enrollments.enrollmentId')), 'studentsCount'],
          [sequelize.fn('COUNT', sequelize.col('reviews.reviewId')), 'reviewsCount']
        ],
        group: ['Course.courseId'],
        order: [['createdAt', 'DESC']],
        limit: 3,
        subQuery: false
      });

    case 'institution':
      return Course.findAll({
        where: {
          organizerId: userId,
          status: 'published'
        },
        include: [{
          association: 'instructor',
          attributes: ['userId', 'fullName']
        }, {
          model: Enrollment,
          as: 'enrollments',
          attributes: [],
          required: false
        }, {
          model: Review,
          as: 'reviews',
          attributes: [],
          required: false
        }],
        attributes: [
          'courseId',
          'title',
          'createdAt',
          [sequelize.fn('COUNT', sequelize.col('enrollments.enrollmentId')), 'enrollments'],
          [sequelize.fn('AVG', sequelize.col('reviews.rating')), 'avgRating']
        ],
        group: ['Course.courseId', 'instructor.userId'],
        order: [['createdAt', 'DESC']],
        limit: 3,
        subQuery: false
      });

    default:
      return [];
  }
}

async function getEnrolledCourseIds(userId) {
  const enrollments = await Enrollment.findAll({
    where: { userId },
    attributes: ['courseId'],
    raw: true
  });
  
  return enrollments.map(e => e.courseId);
}

async function countStudentsInCourses(courses) {
  const courseIds = courses.map(c => c.courseId);
  
  if (courseIds.length === 0) return 0;

  return Enrollment.count({
    where: {
      courseId: { [Op.in]: courseIds },
      status: { [Op.not]: 'canceled' }
    },
    distinct: true,
    col: 'userId'
  });
}

async function calculateAverageRating(userId, role) {
  if (role === 'instructor') {
    const result = await Review.findOne({
      where: { instructorId: userId },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'average'],
        [sequelize.fn('COUNT', sequelize.col('reviewId')), 'count']
      ],
      raw: true
    });
    
    return {
      average: parseFloat(result?.average || 0).toFixed(1),
      count: result?.count || 0
    };
  }
  
  // Para cursos de instituições
  const result = await Review.findOne({
    include: [{
      model: Course,
      where: { organizerId: userId },
      attributes: []
    }],
    attributes: [
      [sequelize.fn('AVG', sequelize.col('rating')), 'average'],
      [sequelize.fn('COUNT', sequelize.col('reviewId')), 'count']
    ],
    raw: true
  });
  
  return {
    average: parseFloat(result?.average || 0).toFixed(1),
    count: result?.count || 0
  };
}

function calculateCompletionRate(enrollments) {
  if (!enrollments || enrollments.length === 0) return 0;
  
  const completed = enrollments.filter(e => 
    e.Enrollment.status === 'completed'
  ).length;
  
  return Math.round((completed / enrollments.length) * 100);
}

function calculateHoursLearned(enrollments) {
  if (!enrollments || enrollments.length === 0) return 0;
  
  const totalHours = enrollments.reduce((total, enrollment) => {
    const courseDuration = enrollment.duration || 0;
    const progress = enrollment.Enrollment.progress || 0;
    return total + (courseDuration * progress) / 100;
  }, 0);
  
  return Math.round(totalHours * 10) / 10; // Arredonda para 1 casa decimal
}

async function getBasicStats(userId) {
  const [activities] = await Promise.all([
    calculateLearningTime(userId),
  ]);

  return {
    learningHours: activities || 0
  };
}

async function calculateLearningTime(userId) {
  // Buscar todas as atividades relevantes
  const learningActivities = await Activity.findAll({
    where: { 
      userId,
      type: {
        [Op.in]: [
          'course_started', 
          'course_completed', 
          'lesson_completed', 
          'resource_viewed'
        ]
      }
    },
    order: [['createdAt', 'ASC']],
    raw: true
  });

  // Calcular tempo baseado em sessões (aproximação)
  let totalSeconds = 0;
  let lastActivityTime = null;
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos em milissegundos

  learningActivities.forEach(activity => {
    const currentTime = new Date(activity.createdAt).getTime();
    
    if (lastActivityTime && (currentTime - lastActivityTime <= SESSION_TIMEOUT)) {
      // Considera como parte da mesma sessão
      totalSeconds += (currentTime - lastActivityTime) / 1000;
    } else {
      totalSeconds += 5 * 60; 
    }
    
    lastActivityTime = currentTime;
  });

  // Converter para horas (com no máximo 2 casas decimais)
  const learningHours = parseFloat((totalSeconds / 3600).toFixed(2));
  
  // Usar metadata se disponível
  const hasDurationInMetadata = learningActivities.some(a => 
    a.metadata && a.metadata.duration
  );
  
  if (hasDurationInMetadata) {
    const metadataDuration = learningActivities.reduce((sum, activity) => {
      return sum + (activity.metadata?.duration || 0);
    }, 0);
    
    return Math.max(learningHours, parseFloat((metadataDuration / 3600).toFixed(2)));
  }

  return learningHours;
}

async function getStudentStats(userId) {
  const enrollments = await Enrollment.findAll({
    where: { userId },
    attributes: ['status', 'progress'],
    include: [{
      model: Course,
      as: 'course',
      attributes: ['duration'],
      required: true
    }],
    raw: true
  });

  const completed = enrollments.filter(e => e.status === 'completed').length;
  const progressSum = enrollments.reduce((sum, e) => sum + (e.progress || 0), 0);
  const avgProgress = enrollments.length > 0 
    ? Math.round(progressSum / enrollments.length) 
    : 0;

  return {
    coursesEnrolled: enrollments.length,
    coursesCompleted: completed,
    averageProgress: avgProgress,
    completionRate: enrollments.length > 0
      ? Math.round((completed / enrollments.length) * 100)
      : 0
  };
}

async function getInstructorStats(userId) {
  const [courses, students, ratings] = await Promise.all([
    Course.count({ where: { instructorId: userId } }),
    Enrollment.count({
      distinct: true,
      col: 'userId',
      include: [{
        model: Course,
        as: 'course',
        where: { instructorId: userId }
      }]
    }),
    Review.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'avg'],
        [sequelize.fn('COUNT', sequelize.col('reviewId')), 'count']
      ],
      where: { userId },
      raw: true
    })
  ]);

  return {
    coursesTaught: courses,
    totalStudents: students,
    averageRating: ratings?.avg ? parseFloat(ratings.avg).toFixed(1) : null,
    totalReviews: ratings?.count || 0
  };
}

async function getAdminStats() {
  const [users, courses, events] = await Promise.all([
    User.count(),
    Course.count(),
    Event.count({
      where: {
        startDate: { [Op.gte]: new Date() }
      }
    })
  ]);

  return {
    totalUsers: users,
    totalCourses: courses,
    upcomingEvents: events
  };
}

// Formata perfil público básico
const formatPublicProfile = (user, isOwnProfile) => {
  const baseData = {
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    bio: user.bio,
    isPrivate: false,
    isOwnProfile,
    stats: {
      taughtCoursesCount: user.get('taughtCoursesCount') || 0,
      enrolledCoursesCount: user.get('enrolledCoursesCount') || 0,
      reviewsCount: user.get('reviewsCount') || 0
    }
  };

  // Adiciona campos específicos por role
  if (user.role === 'instructor') {
    baseData.website = user.website;
    baseData.expertise = user.expertise?.slice(0, 3) || []; 
    baseData.rating = calculateInstructorRating(user.reviews || []);
  }

  return baseData;
};

// Formata perfil completo com todos os dados
const formatCompleteProfile = (user, isOwnProfile) => {
  const publicData = formatPublicProfile(user, isOwnProfile);
  publicData.isPrivate = false;

  // Adiciona campos privados
  const privateFields = {
    email: user.email,
    contactPhone: user.contactPhone,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    notificationPreferences: user.notificationPreferences,
    socialMedia: filterSocialMedia(user.socialMedia, isOwnProfile)
  };

  // Adiciona campos específicos por role
  const roleSpecificFields = {};
  switch (user.role) {
    case 'student':
      roleSpecificFields.interests = user.interests || [];
      roleSpecificFields.educationLevel = user.educationLevel;
      roleSpecificFields.enrolledCourses = user.enrolledCourses || [];
      break;
    
    case 'instructor':
      roleSpecificFields.expertise = user.expertise || [];
      roleSpecificFields.taughtCourses = user.taughtCourses || [];
      roleSpecificFields.reviews = user.reviews || [];
      roleSpecificFields.organizedEvents = user.organizedEvents || [];
      break;
    
    case 'institution':
      roleSpecificFields.institutionName = user.institutionName;
      roleSpecificFields.institutionType = user.institutionType;
      roleSpecificFields.website = user.website;
      roleSpecificFields.academicPrograms = user.academicPrograms || [];
      break;
  }

  return {
    ...publicData,
    ...privateFields,
    ...roleSpecificFields,
    stats: {
      ...publicData.stats,
      organizedEventsCount: user.organizedEvents?.length || 0,
      followersCount: user.dataValues.followersCount || 0,
      followingCount: user.dataValues.followingCount || 0
    }
  };
};

const filterSocialMedia = (socialMedia, isOwnProfile) => {
  if (!socialMedia) return {};
  
  if (isOwnProfile) return socialMedia;

  const publicSocialMedia = {};
  for (const [platform, data] of Object.entries(socialMedia)) {
    if (data?.isPublic) {
      publicSocialMedia[platform] = {
        url: data.url,
        username: data.username
      };
    }
  }
  return publicSocialMedia;
};

// Calcula rating médio para instrutores
const calculateInstructorRating = (reviews) => {
  if (!reviews || reviews.length === 0) return null;
  
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return parseFloat((total / reviews.length).toFixed(1));
};


async function getStudentProgress(userId) {
  const [courses, events] = await Promise.all([
    // Cursos matriculados
    Enrollment.findAll({
      where: { userId },
      include: [{
        model: Course,
        as: 'course',
        attributes: ['courseId', 'title', 'coverImageUrl', 'duration']
      }],
      attributes: ['progress', 'status', 'completedAt']
    }),
    
    // Eventos participados
    EventParticipant.findAll({
      where: { userId },
      include: [{
        model: Event,
        as: 'event',
        attributes: ['eventId', 'title', 'startDate']
      }]
    })
  ]);

  const completedCourses = courses.filter(c => c.status === 'completed').length;
  const learningHours = courses.reduce((sum, c) => sum + (c.course.duration * (c.progress/100)), 0);

  return {
    type: 'student',
    stats: {
      coursesEnrolled: courses.length,
      coursesCompleted: completedCourses,
      totalLearningHours: Math.round(learningHours),
      eventsAttended: events.length
    },
    courses: courses.map(c => ({
      id: c.course.courseId,
      title: c.course.title,
      progress: c.progress,
      image: c.course.coverImageUrl,
      duration: c.course.duration,
      status: c.status
    })),
    events: events.map(e => ({
      id: e.event.eventId,
      title: e.event.title,
      date: e.event.startDate
    }))
  };
}

async function getInstructorProgress(userId) {
  const [courses, events] = await Promise.all([
    // Cursos ministrados
    Course.findAll({
      where: { instructorId: userId },
      include: [{
        model: User,
        as: 'students',
        attributes: [],
        through: {
          attributes: []
        }
      }],
      attributes: [
        'courseId', 'title',
        [sequelize.fn('COUNT', sequelize.col('students.userId')), 'studentCount']
      ],
      group: ['Course.courseId'],
      order: [['createdAt', 'DESC']],
      limit: 5
    }),
    
    // Eventos organizados
    Event.findAll({
      where: { organizerId: userId },
      include: [{
        model: User,
        as: 'participants',
        attributes: []
      }],
      attributes: [
        'eventId', 'title', 'startDate',
        [sequelize.fn('COUNT', sequelize.col('participants.userId')), 'participantCount']
      ],
      group: ['Event.eventId'],
      order: [['startDate', 'ASC']],
      limit: 5
    })
  ]);

  const totalStudents = courses.reduce((sum, c) => sum + parseInt(c.get('studentCount')), 0);
  const totalParticipants = events.reduce((sum, e) => sum + parseInt(e.get('participantCount')), 0);

  return {
    type: 'instructor',
    teachingStats: {
      totalCourses: courses.length,
      totalStudents,
      totalEvents: events.length,
      totalParticipants
    },
    recentCourses: courses.map(c => ({
      id: c.courseId,
      title: c.title,
      students: c.get('studentCount')
    })),
    upcomingEvents: events.map(e => ({
      id: e.eventId,
      title: e.title,
      date: e.startDate,
      participants: e.get('participantCount')
    }))
  };
}

async function getInstitutionProgress(institutionId) {
  const [
    totalUsers,
    totalCourses,
    completedCourses,
    totalLearningHours,
    activeUsers,
    eventsStats,
    recentCourses,
    upcomingEvents
  ] = await Promise.all([
    // Total de usuários
    User.count({
      where: { institutionId }
    }),
    
    // Total de cursos
    Course.count({
      where: { institutionId }
    }),
    
    // Cursos completados
    Enrollment.count({
      where: { status: 'completed' },
      include: [{
        model: Course,
        where: { institutionId }
      }]
    }),
    
    // Total de horas de aprendizado
    Enrollment.sum('progress', {
      include: [{
        model: Course,
        where: { institutionId },
        attributes: []
      }]
    }).then(totalProgress => {
      return Course.sum('duration', {
        where: { institutionId }
      }).then(totalDuration => {
        return Math.round((totalProgress / 100) * totalDuration);
      });
    }),
    
    // Usuários ativos (últimos 30 dias)
    Activity.count({
      distinct: true,
      col: 'userId',
      where: { 
        createdAt: { 
          [Op.gte]: new Date(new Date() - 30 * 24 * 60 * 60 * 1000) 
        }
      },
      include: [{
        model: Course,
        where: { institutionId },
        attributes: []
      }]
    }),
    
    // Estatísticas de eventos
    Event.findAndCountAll({
      where: { institutionId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('eventId')), 'totalEvents'],
        [sequelize.fn('SUM', sequelize.literal(`
          (SELECT COUNT(*) FROM event_participants 
          WHERE event_participants.eventId = Event.eventId)
        `)), 'totalParticipants']
      ],
      raw: true
    }),
    
    // Cursos recentes
    Course.findAll({
      where: { institutionId },
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [{
        model: User,
        as: 'students',
        attributes: [],
        through: {
          attributes: []
        }
      }],
      attributes: [
        'courseId', 'title',
        [sequelize.fn('COUNT', sequelize.col('students.userId')), 'studentCount']
      ],
      group: ['Course.courseId']
    }),
    
    // Próximos eventos
    Event.findAll({
      where: { 
        institutionId,
        startDate: { [Op.gte]: new Date() }
      },
      order: [['startDate', 'ASC']],
      limit: 5,
      include: [{
        model: User,
        as: 'participants',
        attributes: []
      }],
      attributes: [
        'eventId', 'title', 'startDate',
        [sequelize.fn('COUNT', sequelize.col('participants.userId')), 'participantCount']
      ],
      group: ['Event.eventId']
    })
  ]);

  const completionRate = totalCourses > 0 
    ? Math.round((completedCourses / totalCourses) * 100)
    : 0;

  return {
    type: 'institution',
    stats: {
      totalUsers,
      totalCourses,
      completedCourses,
      totalLearningHours,
      eventsAttended: eventsStats.count,
      totalParticipants: eventsStats.rows[0]?.totalParticipants || 0
    },
    userEngagement: {
      activeUsers,
      completionRate
    },
    recentCourses: recentCourses.map(c => ({
      id: c.courseId,
      title: c.title,
      students: c.get('studentCount')
    })),
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.eventId,
      title: e.title,
      date: e.startDate,
      participants: e.get('participantCount')
    }))
  };
}

/**
 * Controller para operações relacionadas a usuários
 */
module.exports = {
   /** 
    * Busca de usuários com debounce
    * Seleção múltipla de participantes
   */
   searchUsers: async (req, res) => {
    const { q, excludeCurrent = true } = req.query;
    
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { username: { [Op.iLike]: `%${q}%` } },
          { email: { [Op.iLike]: `%${q}%` } }
        ],
        ...(excludeCurrent && { userId: { [Op.ne]: req.user.userId } })
      },
      attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'email'],
      limit: 10
    });
  
    res.json(users);
  },
  /**
   * Obtém o perfil do usuário logado
   */
  getProfile: async(req, res, next) => {
    try {
      const userId = req.user.userId;
  
      const includeConfig = [
        {
          model: Course,
          as: 'taughtCourses',
          attributes: ['courseId', 'title', 'slug', 'price', 'category', 'level', 'shortDescription', 'isPublic', 'coverImageUrl', 'ratingAverage', 'ratingCount'],
          include: [{
            model: User,
            as: 'instructor',
            attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'role']
          }],
          required: false,
          limit: 5,
          order: [['createdAt', 'DESC']]
        },
        {
          model: Course,
          as: 'enrolledCourses',
          attributes: ['courseId', 'title', 'slug', 'coverImageUrl'],
          through: { 
            attributes: ['enrolledAt', 'progress'],
            where: { status: 'active' }
          },
          required: false,
          order: [[{ model: Enrollment, as: 'enrollment' }, 'enrolledAt', 'DESC']]
        },
        {
          model: Event,
          as: 'organizedEvents',
          attributes: ['eventId', 'title', 'startDate', 'location', 'status'],
          required: false,
          limit: 3,
          order: [['startDate', 'DESC']]
        },
        {
          model: Event,
          as: 'eventsAttended',
          attributes: ['eventId', 'title', 'startDate'],
          through: { 
            attributes: ['registeredAt'],
            where: { status: 'attended' }
          },
          required: false,
          order: [[{ model: EventParticipant, as: 'participation' }, 'registeredAt', 'DESC']]
        },
        {
          model: Review,
          as: 'reviews',
          attributes: ['reviewId', 'rating', 'comment', 'createdAt'],
          include: [{
            model: Course,
            as: 'course',
            attributes: ['courseId', 'title', 'slug']
          }],
          required: false,
          limit: 3,
          order: [['createdAt', 'DESC']]
        }
      ];
  
      // Busca o usuário com todas as associações
      const user = await User.findByPk(userId, {
        attributes: {
          include: [
            [sequelize.literal('(SELECT COUNT(*) FROM "enrollments" WHERE "enrollments"."userId" = "User"."userId" AND status = \'active\')'), 'activeEnrollmentsCount'],
            [sequelize.literal('(SELECT COUNT(*) FROM "courses" WHERE "courses"."instructorId" = "User"."userId" AND "isPublic" = \'True\')'), 'publishedCoursesCount'],
            [sequelize.literal('(SELECT COUNT(*) FROM "events" WHERE "events"."organizerId" = "User"."userId")'), 'organizedEventsCount'],
            [sequelize.literal('(SELECT COUNT(*) FROM "reviews" WHERE "reviews"."userId" = "User"."userId")'), 'reviewsCount']
          ],
          exclude: ['password', 'verificationToken', 'passwordResetToken']
        },
        include: includeConfig
      });
  
      if (!user) {
        throw new NotFoundError('Usuário não encontrado');
      }
  
      // Contagens de relacionamentos
      const [followersCount, followingCount] = await Promise.all([
        UserRelationship.count({
          where: {
            relatedUserId: userId,
            relationshipType: 'follow',
            status: 'accepted'
          }
        }),
        UserRelationship.count({
          where: {
            userId: userId,
            relationshipType: 'follow',
            status: 'accepted'
          }
        })
      ]);
  
      // Calcular progresso médio nos cursos
      const enrollments = await Enrollment.findAll({
        where: { userId, status: 'active' },
        attributes: ['progress']
      });
      
      const averageProgress = enrollments.length > 0 
        ? enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length
        : 0;

        const userData = user.get({ plain: true });
  
      // Formatar resposta
      const response = {
        user: userData,

        stats: {
          followersCount,
          followingCount,
          averageProgress: Math.round(averageProgress),
          completedCourses: enrollments.filter(e => e.progress === 100).length,
          publishedCoursesCount: parseInt(user.publishedCoursesCount, 10) || 0
        }
      };
  
      res.json(response);
  
    } catch (error) {
      console.error("Erro ao buscar perfil:", error);
      next(error);
    }
  },  

  getUserProfile: async (req, res, next) => {
    try {
      const { username, userId, role } = req.params;
      const requestingUserId = req.user?.userId;
      const isAdmin = req.user?.role === 'admin';
  
      const includeConfig = [
        {
          model: Course,
          as: 'taughtCourses',
          attributes: ['courseId', 'title', 'slug', 'price', 'category', 'level', 'shortDescription', 'isPublic', 'coverImageUrl', 'ratingAverage', 'ratingCount'],
          include: [{
            model: User,
            as: 'instructor',
            attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'role']
          }],
          required: false,
          limit: 5,
          order: [['createdAt', 'DESC']]
        },
        {
          model: Course,
          as: 'enrolledCourses',
          attributes: ['courseId', 'title', 'slug'],
          through: { attributes: [] },
          required: false,
        },
        {
          model: Event,
          as: 'organizedEvents',
          attributes: ['eventId', 'title', 'startDate'],
          required: false,
          limit: 3
        },
        {
          model: Review,
          as: 'reviews',
          attributes: ['reviewId', 'rating', 'comment', 'createdAt'],
          include: [{
            model: Course,
            as: 'course',
            attributes: ['courseId', 'title', 'slug']
          }],
          required: false,
          limit: 3
        }
      ];
  
      // Busca o usuário com todas as associações relevantes
      const user = await User.findOne({
        where: { username },
        attributes: {
          include: [
            [sequelize.literal('(SELECT COUNT(*) FROM "enrollments" WHERE "enrollments"."userId" = "User"."userId")'), 'enrolledCoursesCount'],
            [sequelize.literal('(SELECT COUNT(*) FROM "courses" WHERE "courses"."instructorId" = "User"."userId")'), 'taughtCoursesCount'],
            [sequelize.literal('(SELECT COUNT(*) FROM "reviews" WHERE "reviews"."userId" = "User"."userId")'), 'reviewsCount'],
            [sequelize.literal(`(
              SELECT COUNT(*) FROM "user_relationships" 
              WHERE "user_relationships"."relatedUserId" = "User"."userId" 
              AND "relationshipType" = 'follow'
              AND "status" = 'accepted'
            )`), 'followersCount'],
            [sequelize.literal(`(
              SELECT COUNT(*) FROM "user_relationships" 
              WHERE "user_relationships"."userId" = "User"."userId" 
              AND "relationshipType" = 'follow'
              AND "status" = 'accepted'
            )`), 'followingCount'],
            'website',
          ],
          exclude: [
            'password',
            'verificationToken',
            'passwordResetToken',
            'passwordResetExpires'
          ]
        },
        include: includeConfig
      });
  
      if (!user) {
        throw new NotFoundError('Usuário não encontrado');
      }
  
      // Verificação de permissão e privacidade
      const isOwnProfile = requestingUserId && user.userId === requestingUserId;
      const canViewPrivate = isOwnProfile || isAdmin;
  
      if (!canViewPrivate && user.isPrivate === true) {
        return res.json({
          success: true,
          data: formatPublicProfile(user, false)
        });
      }
  
      // Verificar se o usuário solicitante está seguindo este perfil
      let isFollowing = false;
      if (requestingUserId && !isOwnProfile) {
        const followRelationship = await UserRelationship.findOne({
          where: {
            userId: requestingUserId,
            relatedUserId: user.userId,
            relationshipType: 'follow',
            status: 'accepted'
          }
        });
        isFollowing = !!followRelationship;
      }
  
      // Formata os dados completos do perfil
      const profileData = formatCompleteProfile(user, isOwnProfile);
      
      const responseData = {
        ...profileData,
        isFollowing
      };
  
      res.json({
        success: true,
        data: responseData
      });
  
    } catch (error) {
      console.log("Motivo: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  getUserStats: async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const requestingUserId = req.user.userId;
  
      // Verificação de permissão
      if (userId !== requestingUserId && req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'Unauthorized access to user stats' 
        });
      }
  
      // Verificação rápida da existência do usuário
      const userExists = await User.count({ where: { userId } });
      if (!userExists) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found' 
        });
      }
  
      // Busca paralela das estatísticas básicas
      const [user, basicStats] = await Promise.all([
        User.findByPk(userId, {
          attributes: ['role', 'lastLogin'],
          raw: true
        }),
        getBasicStats(userId)
      ]);
  
      // Estatísticas específicas por role
      let roleStats = {};
      if (user.role === 'student') {
        roleStats = await getStudentStats(userId);
      } else if (user.role === 'instructor') {
        roleStats = await getInstructorStats(userId);
      } else if (user.role === 'admin') {
        roleStats = await getAdminStats();
      }
  
      res.json({
        success: true,
        data: {
          ...basicStats,
          ...roleStats,
          lastActive: user.lastLogin
        }
      });
  
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to load user statistics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getUserFollowers: async (req, res) => {
    try {
      const { userId } = req.params;
      
      const followers = await UserRelationship.findAll({
        where: { 
          relatedUserId: userId,
          relationshipType: 'follow',
          status: 'accepted'
        },
        include: [{
          model: User,
          as: 'initiator',
          attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'bio']
        }]
      });
  
      const formattedFollowers = followers.map(rel => ({
        userId: rel.initiator.userId,
        username: rel.initiator.username,
        fullName: rel.initiator.fullName,
        avatarUrl: rel.initiator.avatarUrl,
        bio: rel.initiator.bio
      }));
  
      res.json(formattedFollowers);
    } catch (error) {
      console.error('Error fetching followers:', error);
      res.status(500).json({ message: 'Error fetching followers' });
    }
  },
  
  getUserFollowing: async (req, res) => {
    try {
      const { userId } = req.params;
      
      const following = await UserRelationship.findAll({
        where: { 
          userId: userId,
          relationshipType: 'follow',
          status: 'accepted'
        },
        include: [{
          model: User,
          as: 'target',
          attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'bio']
        }]
      });
  
      const formattedFollowing = following.map(rel => ({
        userId: rel.target.userId,
        username: rel.target.username,
        fullName: rel.target.fullName,
        avatarUrl: rel.target.avatarUrl,
        bio: rel.target.bio
      }));
  
      res.json(formattedFollowing);
    } catch (error) {
      console.error('Error fetching following:', error);
      res.status(500).json({ message: 'Error fetching following' });
    }
  },
  
  getFollowStatus: async (req, res) => {
    try {
      const { targetUserId } = req.params;
      const currentUserId = req.user.userId;
  
      const relationship = await UserRelationship.findOne({
        where: {
          userId: currentUserId,
          relatedUserId: targetUserId,
          relationshipType: 'follow'
        }
      });
  
      res.json({
        isFollowing: !!relationship && relationship.status === 'accepted'
      });
    } catch (error) {
      console.error('Error checking follow status:', error);
      res.status(500).json({ message: 'Error checking follow status' });
    }
  },
  
  followUser: async (req, res) => {
    try {
      const { targetUserId } = req.params;
      const currentUserId = req.user.userId;
  
      if (currentUserId === targetUserId) {
        return res.status(400).json({ message: 'Cannot follow yourself' });
      }
  
      const [relationship, created] = await UserRelationship.findOrCreate({
        where: {
          userId: currentUserId,
          relatedUserId: targetUserId,
          relationshipType: 'follow'
        },
        defaults: {
          status: 'accepted'
        }
      });
  
      if (!created && relationship.status === 'accepted') {
        return res.status(200).json({ message: 'Already following this user' });
      }
  
      if (!created) {
        relationship.status = 'accepted';
        await relationship.save();
      }

      // Envia notificações
    await notificationService.notifyNewFollower(currentUserId, targetUserId);
  
      res.json({ message: 'Successfully followed user' });
    } catch (error) {
      console.error('Error following user:', error);
      res.status(500).json({ message: 'Error following user' });
    }
  },
  
  unfollowUser: async (req, res) => {
    try {
      const { targetUserId } = req.params;
      const currentUserId = req.user.userId;
  
      const result = await UserRelationship.destroy({
        where: {
          userId: currentUserId,
          relatedUserId: targetUserId,
          relationshipType: 'follow'
        }
      })
  
      if (result === 0) {
        return res.status(404).json({ message: 'Follow relationship not found' });
      }

      // Envia notificação de unfollow
      await notificationService.notifyUnfollowed(currentUserId, targetUserId);
  
      res.json({ message: 'Successfully unfollowed user' });
    } catch (error) {
      console.error('Error unfollowing user:', error);
      res.status(500).json({ message: 'Error unfollowing user' });
    }
  },

  getProgressData: async (req, res, next) => {
    try {
      const { userId } = req.user;
      const user = await User.findByPk(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      let progressData;
  
      switch (user.role) {
        case 'student':
          progressData = await getStudentProgress(userId);
          break;
        case 'instructor':
          progressData = await getInstructorProgress(userId);
          break;
        case 'institution':
          progressData = await getInstitutionProgress(userId);
          break;
        default:
          return res.status(400).json({ error: 'Invalid user role' });
      }
  
      res.json({
        success: true,
        data: progressData
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Atualiza o perfil do usuário logado
   */
  async updateProfile(req, res, next) {
    try {
      const {
        username,
        email,
        fullName,
        currentPassword,
        newPassword,
        bio,
        interests,
        expertise,
        website,
        notificationPreferences,
        messagePreferences,
        institutionName,
        institutionType,
        academicPrograms,
        contactPhone,
        socialMedia
      } = req.body;
  
      // Busca o usuário com bloqueio para evitar condições de corrida
      const user = await User.findByPk(req.user.userId, {
        attributes: { exclude: ['password'] },
        lock: true
      });
  
      if (!user) {
        throw new NotFoundError('Usuário não encontrado');
      }

      // Função auxiliar para limpar e validar campos string
      const cleanStringField = (value) => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed !== '' ? trimmed : null;
        }
        return value;
      };

      // Objeto com todos os campos atualizáveis
      const updatableFields = {
        fullName: cleanStringField(fullName),
        bio: cleanStringField(bio),
        website: cleanStringField(website),
        notificationPreferences,
        messagePreferences,
        institutionName: cleanStringField(institutionName),
        institutionType,
        contactPhone: cleanStringField(contactPhone),
        socialMedia
      };

      const filteredFields = Object.fromEntries(
        Object.entries(updatableFields).filter(([_, value]) => 
          value !== undefined && value !== null
        )
      );

      // Atualiza campos comuns
      Object.assign(user, filteredFields);

      // Validação de campos únicos
      if (username && username !== user.username) {
        const existingUser = await User.findOne({ 
          where: { username },
          attributes: ['userId']
        });
        
        if (existingUser) {
          throw new BadRequestError('Nome de usuário já está em uso');
        }
        user.username = cleanStringField(username);
      }
  
      if (email && email !== user.email) {
        const existingEmail = await User.findOne({ 
          where: { email },
          attributes: ['userId']
        });
        
        if (existingEmail) {
          throw new BadRequestError('Email já está em uso');
        }
        user.email = cleanStringField(email);
        user.isVerified = false;
        await sendVerificationEmail(user);
      }
  
      // Campos específicos por role
      if (user.role === 'student' && interests) {
        user.interests = Array.isArray(interests) 
          ? interests.filter(i => i.trim() !== '')
          : [interests.trim()].filter(i => i !== '');
      }
  
      if (user.role === 'instructor' && expertise) {
        user.expertise = Array.isArray(expertise)
          ? expertise.filter(e => e.trim() !== '')
          : [expertise.trim()].filter(e => e !== '');
      }
  
      // Campos específicos para instituição
      if (user.role === 'institution') {
        if (academicPrograms) {
          user.academicPrograms = Array.isArray(academicPrograms)
            ? academicPrograms.filter(p => p.trim() !== '')
            : [academicPrograms.trim()].filter(p => p !== '');
        }
        
        // Validações específicas para instituição
        if (institutionName && institutionName.length < 5) {
          throw new BadRequestError('O nome da instituição deve ter pelo menos 5 caracteres');
        }
        
        if (institutionType && ![
          'Universidade', 'Faculdade', 'Escola Técnica', 
          'Centro de Pesquisa', 'Plataforma Online',
          'ONG Educacional', 'Outro'
        ].includes(institutionType)) {
          throw new BadRequestError('Tipo de instituição inválido');
        }
      }
  
      // Atualização de senha
      if (newPassword) {
        if (!currentPassword) {
          throw new BadRequestError('Senha atual é necessária para alterar a senha');
        }
  
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
          throw new BadRequestError('Senha atual incorreta');
        }
  
        if (newPassword.length < 8) {
          throw new BadRequestError('A nova senha deve ter pelo menos 8 caracteres');
        }
  
        user.password = await bcrypt.hash(newPassword, 12);
        user.passwordChangedAt = new Date();
      }
  
      // Upload de avatar
      if (req.file) {
        try {
          const result = await uploadToCloudinary(req.file, 'avatars', user.userId);
          
          if (user.avatarUrl && !user.avatarUrl.includes('default-avatar')) {
            await deleteFromCloudinary(user.avatarUrl).catch(console.error);
          }
          
          user.avatarUrl = result.secure_url;
        } catch (uploadError) {
          console.error('Avatar upload error:', uploadError);
          throw new BadRequestError('Falha ao processar a imagem do perfil');
        }
      }
  
      // Marcar perfil como completo se critérios forem atendidos
      if (!user.profileCompleted) {
        const requiredFields = {
          student: ['username', 'email', 'fullName', 'interests', 'bio'],
          instructor: ['username', 'email', 'fullName', 'expertise', 'bio', 'website'],
          institution: ['username', 'email', 'institutionName', 'institutionType', 'website', 'academicPrograms']
        };
  
        const isComplete = requiredFields[user.role].every(field => {
          const value = user[field];
          return value && (Array.isArray(value) ? value.length > 0 : value.trim() !== '');
        });
  
        user.profileCompleted = isComplete;
      }
  
      // Salva todas as alterações em uma transação
      await sequelize.transaction(async (t) => {
        await user.save({ transaction: t });
      });
  
      // Gerar novo token se email foi alterado
      let token;
      if (email && email !== user.email) {
        token = createToken(user.userId, user.role);
      }
  
      // Resposta formatada
      const userResponse = user.get({ plain: true });
      delete userResponse.password;
      delete userResponse.verificationToken;
      delete userResponse.passwordChangedAt;
  
      res.json({
        success: true,
        data: {
          user: userResponse,
          token: token || undefined
        },
        meta: {
          profileCompleted: user.profileCompleted,
          isVerified: user.isVerified,
          updatedAt: user.updatedAt
        }
      });
  
    } catch (error) {
      next(error);
    }
},

  /**
   * Obtém um usuário por ID (apenas para admin ou o próprio usuário)
   */
  async getUserById(req, res, next) {
    try {
      const { id } = req.params;
      const requestingUser = await User.findByPk(req.user.userId);

      // Verifica se o usuário solicitante tem permissão
      if (requestingUser.role !== 'instructor' && requestingUser.id !== id) {
        throw new ForbiddenError('Você não tem permissão para acessar este perfil');
      }

      const user = await User.findByPk(id, {
        attributes: { exclude: ['password', 'verificationToken'] },
        include: [
          {
            association: 'taughtCourses',
            attributes: ['courseId', 'title', 'description', 'createdAt'],
            where: { isPublic: true }
          },
          {
            association: 'enrolledCourses',
            attributes: ['courseId', 'title', 'status'],
            through: { attributes: [] }
          }
        ]
      });

      if (!user) {
        throw new NotFoundError('Usuário não encontrado');
      }

      // Se não for admin, remove informações sensíveis
      if (requestingUser.role !== 'admin') {
        delete user.dataValues.email;
        delete user.dataValues.role;
      }

      res.json(user);
    } catch (error) {
      console.log("ERROR GET USER BY ID: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  /**
   * Dados do dashboard do user
   */

  getUserDashboard: async (req, res) => {
    try {
        const userId = req.params.userId;
        const requestingUserId = req.user.userId;
        const { role } = req.user;

        // Verificação de permissão
        if (userId !== requestingUserId && role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        // Verificação da existência do usuário
        const userExists = await User.count({ 
            where: { userId },
        });

        if (!userExists) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Busca paralela dos dados
        const [user, activities, events, resources, recommendations] = await Promise.all([
            User.findByPk(userId, {
                attributes: ['userId', 'role', 'username', 'fullName', 'avatarUrl', 'status'],
                include: [
                    {
                        association: 'enrolledCourses',
                        through: { attributes: ['progress', 'status'] },
                        attributes: ['courseId', 'title', 'duration', 'coverImageUrl']
                    },
                    {
                        association: 'taughtCourses',
                        attributes: ['courseId', 'title', 'status', 'ratingAverage']
                    },
                    {
                        association: 'reviews',
                        attributes: ['reviewId', 'rating', 'comment']
                    },
                    ...(role === 'institution' ? [{
                        association: 'organizedEvents',
                        attributes: ['eventId', 'title', 'startDate', 'endDate']
                    }] : [])
                ]
            }),
            
            // Dados assíncronos
            getRecentActivities(userId),
            getUpcomingEvents(userId),
            getRecommendations(userId, role)
        ]);

        // Estrutura base do dashboard
        const dashboardData = {
            userInfo: {
                userId: user.userId,
                username: user.username,
                fullName: user.fullName,
                avatar: user.avatarUrl,
                role: user.role,
                status: user.status
            },
            stats: {},
            recentActivities: activities,
            upcomingEvents: events,
            recentResources: resources,
            recommendations,
            lastUpdated: new Date()
        };

        // Cálculos específicos por role
        switch (user.role) {
            case 'student':
                const enrollments = user.enrolledCourses || [];
                const completedCourses = enrollments.filter(e => e.Enrollment.status === 'completed');
                
                dashboardData.stats = {
                    coursesEnrolled: enrollments.length,
                    completedCourses: completedCourses.length,
                    completionRate: calculateCompletionRate(enrollments),
                    hoursLearned: calculateHoursLearned(enrollments),
                    averageRating: user.reviews.length > 0 ? 
                        user.reviews.reduce((sum, review) => sum + review.rating, 0) / user.reviews.length : 0
                };
                
                dashboardData.courseProgress = enrollments.map(enrollment => ({
                    id: enrollment.courseId,
                    title: enrollment.title,
                    progress: enrollment.Enrollment.progress,
                    thumbnail: enrollment.coverImageUrl,
                    status: enrollment.Enrollment.status
                }));
                break;

            case 'instructor':
                const coursesTaught = user.taughtCourses || [];
                
                dashboardData.stats = {
                    activeCourses: coursesTaught.filter(c => c.status === 'published').length,
                    totalStudents: await countStudentsInCourses(coursesTaught),
                    averageRating: coursesTaught.length > 0 ? 
                        coursesTaught.reduce((sum, course) => sum + (course.ratingAverage || 0), 0) / coursesTaught.length : 0,
                    totalReviews: user.reviews.length
                };
                
                dashboardData.teachingStats = {
                    ...dashboardData.stats,
                    draftCourses: coursesTaught.filter(c => c.status === 'draft').length
                };
                break;

            case 'institution':
                const institutionCourses = await Course.count({ 
                    where: { organizerId: userId } 
                });
                
                const institutionStudents = await Enrollment.count({
                    distinct: true,
                    col: 'userId',
                    include: [{
                        model: Course,
                        as: 'course',
                        where: { organizerId: userId }
                    }]
                });
                
                dashboardData.stats = {
                    publishedCourses: institutionCourses,
                    activeStudents: institutionStudents,
                    upcomingEvents: user.organizedEvents?.filter(e => 
                        new Date(e.startDate) > new Date()
                    ).length || 0,
                    totalInstructors: await User.count({
                        where: { 
                            role: 'instructor',
                            '$taughtCourses.organizerId$': userId
                        },
                        include: [{
                            model: Course,
                            as: 'taughtCourses',
                            attributes: []
                        }]
                    })
                };
                
                dashboardData.institutionStats = {
                    ...dashboardData.stats,
                    events: user.organizedEvents?.map(event => ({
                        id: event.eventId,
                        title: event.title,
                        date: event.startDate,
                        status: new Date(event.endDate) < new Date() ? 'completed' : 'upcoming'
                    })) || []
                };
                break;

            case 'admin':
                const [totalUsers, totalCourses, activeEvents] = await Promise.all([
                    User.count(),
                    Course.count(),
                    Event.count({ where: { endDate: { [Op.gte]: new Date() } } })
                ]);
                
                dashboardData.stats = {
                    totalUsers,
                    totalCourses,
                    activeEvents,
                    activeInstructors: await User.count({ where: { role: 'instructor' } }),
                    activeInstitutions: await User.count({ where: { role: 'institution' } }),
                    activeStudents: await User.count({ where: { role: 'student' } })
                };
                break;
        }

        res.json(dashboardData);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ 
            message: 'Failed to load dashboard data',
            ...(process.env.NODE_ENV === 'development' && { 
                error: error.message,
                stack: error.stack 
            })
        });
    }
},
  
  /**
   * Lista todos os usuários (apenas para admin)
   */
  async getAllUsers(req, res, next) {
    try {
      const { page = 1, limit = 20, role, search } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (role) where.role = role;
      if (search) {
        where[Op.or] = [
          { username: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password', 'verificationToken'] },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / limit),
        users: rows
      });
    } catch (error) {
      next(error);
    }
  },

  getCourses: async (req, res) => {
    const { page = 1, limit = 10, status, level, sort } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (level) where.level = level;
  
    const order = sort === 'newest' 
      ? [['createdAt', 'DESC']] 
      : [['createdAt', 'ASC']];
  
    const { count, rows } = await Course.findAndCountAll({
      where,
      order,
      limit,
      offset: (page - 1) * limit,
      include: [{ model: User, as: 'instructor' }]
    });
  
    res.json({
      courses: rows,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalItems: count
    });
  },

  getEvents: async (req, res) => {
    const { page = 1, limit = 10, status, type, sort } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
  
    const order = sort === 'upcoming'
      ? [['startDate', 'ASC']]
      : [['startDate', 'DESC']];
  
    const { count, rows } = await Event.findAndCountAll({
      where,
      order,
      limit,
      offset: (page - 1) * limit,
      include: [{ model: User, as: 'organizer' }]
    });
  
    res.json({
      events: rows,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      totalItems: count
    });
  },

  /**
   * Atualiza o role de um usuário (apenas admin)
   */
  async updateUserRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['student', 'instructor', 'institution', 'admin'].includes(role)) {
        throw new BadRequestError('Role inválido');
      }

      const user = await User.findByPk(id);
      if (!user) {
        throw new NotFoundError('Usuário não encontrado');
      }

      // Impede que admin remova seu próprio privilégio
      if (user.id === req.userId && role !== 'admin') {
        throw new ForbiddenError('Você não pode remover seu próprio role de admin');
      }

      user.role = role;
      await user.save();

      res.json({
        message: `Role do usuário ${user.username} atualizado para ${role}`,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Deleta um usuário (apenas admin ou o próprio usuário)
   */
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;
      const requestingUser = await User.findByPk(req.user.userId);

      // Verifica permissões
      if (requestingUser.role !== 'admin' && requestingUser.id !== id) {
        throw new ForbiddenError('Você não tem permissão para deletar este usuário');
      }

      // Impede que admin se delete
      if (requestingUser.id === id && requestingUser.role === 'admin') {
        throw new ForbiddenError('Administradores não podem se auto-deletar');
      }

      const user = await User.findByPk(id);
      if (!user) {
        throw new NotFoundError('Usuário não encontrado');
      }

      await user.destroy();

      res.json({ message: 'Usuário deletado com sucesso' });
    } catch (error) {
      next(error);
    }
  },

 /**
 * Upload de avatar com tratamento completo
 * - Validação do arquivo
 * - Upload para Cloudinary
 * - Exclusão da imagem antiga (se existir)
 * - Atualização do usuário
 */
async uploadAvatar(req, res, next) {
  try {
    console.log('Arquivo recebido:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    // Validação do arquivo
    if (!req.file || !req.file.buffer) {
      throw new BadRequestError('Nenhum arquivo de avatar válido foi enviado');
    }

    // Buscar usuário
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Preparar dados para o upload conforme o serviço espera
    const uploadParams = {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      options: {
        folder: `users/avatars/${user.userId}`,
        transformation: [
          { width: 200, height: 200, crop: 'thumb', gravity: 'face' },
          { quality: 'auto:best' },
          { radius: 'max' }
        ]
      }
    };

    // Processar upload usando o serviço existente
    let uploadResult;
    try {
      uploadResult = await uploadToCloudinary(uploadParams);
      
      if (!uploadResult?.secure_url) {
        throw new Error('Upload não retornou URL válida');
      }
    } catch (uploadError) {
      console.error('Erro detalhado no serviço de upload:', {
        error: uploadError.message,
        paramsSent: uploadParams,
        user: user.userId
      });
      throw new Error('Falha ao processar o upload do avatar');
    }

    // Atualizar usuário (sem tentar deletar o avatar antigo)
    user.avatarUrl = uploadResult.secure_url;
    await user.save();

    // Resposta de sucesso
    res.json({
      success: true,
      message: 'Avatar atualizado com sucesso',
      avatarUrl: uploadResult.secure_url
    });

  } catch (error) {
    console.error('Erro completo no processo:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      file: req.file ? {
        name: req.file.originalname,
        size: req.file.size
      } : null
    });
    next(error);
  }
},
  getPublicStats: async (req, res) => {
    const MIN_RATING_COUNT = 10;
    const now = new Date();

    try {
      const stats = await Promise.all([
        User.count({ where: { role: 'student' } }),
        User.count({ where: { role: 'instructor' } }),
        User.count({ where: { role: 'institution' } }),
        Course.count({ where: { status: 'published' } }),
        Event.count({ where: { startDate: { [Op.gt]: new Date() } }}),
      ]);

      // Média global das avaliações dos cursos publicados
    const avgResult = await Course.findOne({
      where: { status: 'published' },
      attributes: [[Sequelize.fn('AVG', Sequelize.col('ratingAverage')), 'globalAvg']]
    });

    const GLOBAL_AVERAGE = parseFloat(avgResult?.dataValues?.globalAvg || 4.2);

    // Buscar top cursos com nota ponderada
    const topCourses = await Course.findAll({
      where: { status: 'published' },
      attributes: {
        include: [
          [
            Sequelize.literal(`(
              ("ratingCount" / ("ratingCount" + ${MIN_RATING_COUNT})) * "ratingAverage" +
              (${MIN_RATING_COUNT} / ("ratingCount" + ${MIN_RATING_COUNT})) * ${GLOBAL_AVERAGE}
            )`),
            'weightedRating'
          ]
        ]
      },
      order: [['weightedRating', 'DESC']],
      limit: 5
    });

    // Buscar eventos mais próximos
    const upcomingEvents = await Event.findAll({
      where: {
        startDate: { [Op.gt]: now },
        status: { [Op.in]: ['scheduled', 'live'] }
      },
      order: [['startDate', 'ASC']],
      limit: 5
    });
    
      res.json({
        students: stats[0],
        instructors: stats[1],
        institutions: stats[2],
        courses: stats[3],
        events: stats[4],
        topCourses,
        upcomingEvents
      });
    } catch (error) {
      console.log("ERROR getPublicStats: ", error instanceof Error ? error.message : error);
      next(error);
    }
  }
};