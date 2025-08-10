const { Op } = require('sequelize');
const { Course, User, Event, Review, InstitutionInstructor, UserRelationship } = require('../models');
const { sequelize } = require('../configs/db');

module.exports = {

  /**
 * @function search
 * @description
 * Realiza uma busca em múltiplas entidades da aplicação (cursos, usuários, instrutores, instituições e eventos),
 * com base no termo de busca fornecido. Retorna resultados agrupados por tipo e também um array combinado dos primeiros 20 itens.
 * 
 * @param {import('express').Request} req - Objeto da requisição Express.
 * @param {import('express').Response} res - Objeto da resposta Express.
 * @param {Function} next - Função next para tratamento de erros middleware.
 * 
 * @returns {Promise<void>}
 * 
 * @example
 * GET /api/search?q=react
 * 
 * Response:
 * {
 *   all: [...],
 *   courses: [...],
 *   users: [...],
 *   instructors: [...],
 *   institutions: [...],
 *   events: [...]
 * }
 */
  search: async (req, res, next) => {
    try {
      const { q } = req.query;

      if (!q || q.trim().length < 3) {
        return res.json({
          success: true,
          data: {
            all: [],
            courses: [],
            users: [],
            instructors: [],
            institutions: [],
            events: []
          }
        });
      }

      const searchTerm = `%${q}%`;

      const [courses, users, instructors, institutions, events] = await Promise.all([
        // Cursos
        Course.findAll({
          where: {
            [Op.or]: [
              { title: { [Op.iLike]: searchTerm } },
              { description: { [Op.iLike]: searchTerm } }
            ],
            status: 'published'
          },
          limit: 10,
          include: [{
            model: User,
            as: 'instructor',
            attributes: ['userId', 'username', 'fullName', 'avatarUrl']
          }]
        }),

        // Estudantes
        User.findAll({
          where: {
            role: 'student',
            [Op.or]: [
              { username: { [Op.iLike]: searchTerm } },
              { fullName: { [Op.iLike]: searchTerm } },
              { email: { [Op.iLike]: searchTerm } }
            ]
          },
          attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'bio', 'isPrivate'],
          include: [
            // Cursos em que está matriculado
            {
              model: Course,
              as: 'enrolledCourses',
              required: false,
              through: { where: { status: 'active' }, attributes: [] }
            },
            // Eventos em que participa
            {
              model: Event,
              as: 'eventsAttended',
              required: false,
              through: { attributes: [] }
            },
            // Seguidores
            {
              model: UserRelationship,
              as: 'relationshipsReceived',
              where: {
                relationshipType: 'follow',
                status: 'accepted'
              },
              required: false,
            }
          ],
          limit: 10
        }),

        // Instrutores
        User.findAll({
          where: {
            role: 'instructor',
            [Op.or]: [
              { username: { [Op.iLike]: searchTerm } },
              { fullName: { [Op.iLike]: searchTerm } },
              { email: { [Op.iLike]: searchTerm } },
              { expertise: { [Op.overlap]: [q] } }
            ]
          },
          attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'expertise', 'bio', 'isPrivate'],
          include: [
            {
              model: Course,
              as: 'taughtCourses',
              required: false,
              include: [{
                model: User,
                as: 'students',
                attributes: ['userId'],
                through: { where: { status: 'active' }, attributes: [] }
              }]
            },
            {
              model: Event,
              as: 'organizedEvents',
              required: false,
              include: [{
                model: User,
                as: 'participants',
                attributes: ['userId'],
                through: { attributes: [] }
              }]
            },
            {
              model: UserRelationship,
              as: 'relationshipsReceived',
              where: {
                relationshipType: 'follow',
                status: 'accepted'
              },
              required: false,
            }
          ],
          limit: 10
        }),

        // Instituições
        User.findAll({
          where: {
            role: 'institution',
            [Op.or]: [
              { institutionName: { [Op.iLike]: searchTerm } },
              { academicPrograms: { [Op.overlap]: [q] } }
            ]
          },
          attributes: [
            'userId', 'username', 'institutionName', 'institutionType', 'isPrivate',
            'academicPrograms', 'avatarUrl', 'bio', 'website', 'contactPhone'
          ],
          include: [
            {
              model: Course,
              as: 'taughtCourses',
              required: false,
              include: [{
                model: User,
                as: 'students',
                attributes: ['userId'],
                through: { where: { status: 'active' }, attributes: [] }
              }]
            },
            {
              model: Event,
              as: 'organizedEvents',
              required: false,
              include: [{
                model: User,
                as: 'participants',
                attributes: ['userId'],
                through: { attributes: [] }
              }]
            },
            {
              model: UserRelationship,
              as: 'relationshipsReceived',
              where: {
                relationshipType: 'follow',
                status: 'accepted'
              },
              required: false,
            }
          ],
          limit: 10
        }),

        // Eventos
        Event.findAll({
          where: {
            [Op.or]: [
              { title: { [Op.iLike]: searchTerm } },
              { description: { [Op.iLike]: searchTerm } },
              { location: { [Op.iLike]: searchTerm } }
            ],
            status: 'scheduled'
          },
          limit: 10
        })
      ]);

      const formatWithFollowers = (items, type) => items.map(item => {
        const plain = item.get({ plain: true });
        const followersCount = plain.relationshipsReceived?.length || 0;
        delete plain.relationshipsReceived;
        return {
          ...plain,
          followersCount,
          type
        };
      });

      const formatBasic = (items, type) => items.map(item => ({
        ...item.get({ plain: true }),
        type
      }));

      const allResults = [
        ...formatBasic(courses, 'course'),
        ...formatWithFollowers(users, 'user'),
        ...formatWithFollowers(instructors, 'instructor'),
        ...formatWithFollowers(institutions, 'institution'),
        ...formatBasic(events, 'event')
      ];

      res.json({
        all: allResults.slice(0, 20),
        courses: formatBasic(courses, 'course'),
        users: formatWithFollowers(users, 'user'),
        instructors: formatWithFollowers(instructors, 'instructor'),
        institutions: formatWithFollowers(institutions, 'institution'),
        events: formatBasic(events, 'event')
      });

    } catch (error) {
      console.error('Erro ao realizar busca:', error);
      next(error);
    }
  },

  /**
 * @function searchInstructors
 * @description
 * Realiza uma busca de instrutores na plataforma, filtrando por nome, email ou áreas de expertise.
 * Retorna apenas instrutores verificados e com perfil completo.
 * 
 * @param {import('express').Request} req - Objeto da requisição Express.
 * @param {import('express').Response} res - Objeto da resposta Express.
 * @param {Function} next - Função next para tratamento de erros middleware.
 * 
 * @returns {Promise<void>}
 * 
 * @example
 * GET /api/instructors/search?query=react&excludeInstitutionId=123
 * 
 * Response:
 * {
 *   success: true,
 *   data: [
 *     {
 *       userId: "uuid",
 *       fullName: "Nome do Instrutor",
 *       avatarUrl: "url",
 *       expertise: ["React", "Node"],
 *       rating: 4.8,
 *       coursesCount: 5,
 *       studentsCount: 120,
 *       isVerified: true
 *     }
 *   ]
 * }
 */
  searchInstructors: async (req, res, next) => {
  try {
    const { query, excludeInstitutionId } = req.query;

    const searchTerm = `%${query}%`;
    const excludedInstitution = excludeInstitutionId || null;

    // Busca os instrutores
    const instructors = await User.findAll({
      where: {
        role: 'instructor',
        isVerified: true,
        profileCompleted: true,
        [Op.or]: [
          { fullName: { [Op.iLike]: searchTerm } },
          { email: { [Op.iLike]: searchTerm } },
          { expertise: { [Op.overlap]: [query] } }
        ]
      },
      attributes: [
        'userId', 
        'fullName', 
        'avatarUrl', 
        'expertise', 
        'bio',
        'isVerified'
      ],
      include: [
        {
          model: Course,
          as: 'taughtCourses',
          attributes: ['courseId'],
          required: false,
          where: { status: 'published' }
        },
        {
          model: UserRelationship,
          as: 'relationshipsReceived',
          where: {
            relationshipType: 'follow',
            status: 'accepted'
          },
          required: false,
          attributes: []
        },
        {
          model: Review,
          as: 'reviews',
          attributes: ['rating'],
          required: false
        },
      ],
    });

    // Formata os resultados
    const formattedInstructors = instructors.map(instructor => {
      const plainInstructor = instructor.get({ plain: true });
      
      // Calcula rating médio
      const ratings = plainInstructor.reviews?.map(r => r.rating) || [];
      const averageRating = ratings.length > 0 
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
        : null;

      return {
        userId: plainInstructor.userId,
        fullName: plainInstructor.fullName,
        avatarUrl: plainInstructor.avatarUrl,
        expertise: plainInstructor.expertise || [],
        bio: plainInstructor.bio,
        rating: averageRating,
        coursesCount: plainInstructor.taughtCourses?.length || 0,
        studentsCount: plainInstructor.relationshipsReceived?.length || 0,
        isVerified: plainInstructor.isVerified
      };
    });

    res.json({
      success: true,
      data: formattedInstructors
    });

  } catch (error) {
    console.error('Erro ao buscar instrutores:', error instanceof Error ? error.message : error);
    next(error);
  }
  },

  searchMessageableUsers: async (req, res) => {
    const { q, contextType, contextId } = req.query;
    
    // Baseado no role do remetente
    const allowedRoles = req.user.role === 'student' ? ['instructor'] : 
                       req.user.role === 'instructor' ? ['student', 'institution'] :
                       ['student', 'instructor'];
  
    const where = {
      role: { [Op.in]: allowedRoles },
      [Op.or]: [
        { username: { [Op.iLike]: `%${q}%` } },
        { fullName: { [Op.iLike]: `%${q}%` } }
      ]
    };
  
    // Filtro adicional para contexto de curso
    if (contextType === 'course') {
      where['$taughtCourses.courseId$'] = contextId;
    }
  
    const users = await User.findAll({
      where,
      include: contextType === 'course' ? [{
        model: Course,
        as: 'taughtCourses',
        attributes: []
      }] : [],
      attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'role'],
      limit: 20
    });
  
    res.json(users);
  },
  
  searchEnrolledCourses: async (req, res) => {
    const { q } = req.query;
  
    const courses = await Course.findAll({
      include: [{
        model: User,
        as: 'students',
        where: { userId: req.user.userId },
        through: { where: { status: 'active' } },
        attributes: []
      }, {
        model: User,
        as: 'instructor',
        attributes: ['userId', 'username', 'avatarUrl']
      }],
      where: {
        title: { [Op.iLike]: `%${q}%` },
        status: 'published'
      },
      limit: 10
    });
  
    res.json(courses);
  }

};

