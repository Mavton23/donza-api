const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Course = sequelize.define('Course', {
    courseId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    organizerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [5, 100],
      },
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true
    },
    slug: {
      type: DataTypes.STRING,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/,
      },
    },
    description: {
      type: DataTypes.TEXT,
    },
    shortDescription: {
      type: DataTypes.STRING(200),
    },
    coverImageUrl: {
      type: DataTypes.STRING,
      validate: {
        isUrl: true,
      },
    },
    level: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
      defaultValue: 'beginner',
    },
    duration: { // Em horas
      type: DataTypes.INTEGER,
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD',
    },
    language: {
      type: DataTypes.STRING,
      defaultValue: 'Portuguese',
    },
    requirements: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    learningOutcomes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft',
    },
    metrics: {
      type: DataTypes.JSONB,
      defaultValue: {
        enrollments: 0,
        completionRate: 0,
        avgRating: 0,
        lessonEngagement: {},
        studentDemographics: {}
      }
    },
    ratingAverage: {
      type: DataTypes.DECIMAL(3, 1),
      defaultValue: 0
    },
    ratingCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    messageSettings: {
      type: DataTypes.JSONB,
      defaultValue: {
        studentsCanMessage: true,
        createCourseChannel: true
      }
    }
  }, {
    timestamps: true,
    tableName: 'courses',
    hooks: {
      beforeValidate: (course) => {
        if (course.title) {
          course.slug = course.title
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '');
        }
      },
    },
    indexes: [
      {
        name: 'courses_instructor_index',
        fields: ['instructorId'],
      },
      {
        name: 'courses_category_index',
        fields: ['category']
      },
      {
        name: 'courses_status_index',
        fields: ['status'],
      },
      {
        name: 'courses_title_search_index',
        fields: ['title'],
        using: 'BTREE',
      },
      // Índice para slugs (URLs amigáveis)
      {
        name: 'courses_slug_index',
        fields: ['slug'],
        unique: true,
      }
    ],
  });

  // Course.associate = (models) => {
  //   Course.belongsTo(models.User, {
  //       as: 'instructor',
  //       foreignKey: 'instructorId',
  //   });

  //   Course.belongsTo(models.User, {
  //     as: 'organizer',
  //     foreignKey: 'organizerId',
  //   });

  //   Course.hasMany(models.Module, {
  //       as: 'modules',
  //       foreignKey: 'courseId',
  //       onDelete: 'CASCADE',
  //   });

  //   Course.hasMany(models.Certificate, {
  //     foreignKey: 'courseId',
  //     as: 'certificates'
  //   });

  //   Course.belongsToMany(models.User, {
  //       through: models.Enrollment,
  //       as: 'students',
  //       foreignKey: 'courseId',
  //   });

  //   Course.hasMany(models.Enrollment, {
  //     foreignKey: 'courseId',
  //     as: 'enrollments'
  //   });

  //   Course.hasMany(models.Review, {
  //     foreignKey: 'courseId',
  //     as: 'reviews'
  //   });

  //   Course.hasMany(models.Activity, {
  //     foreignKey: 'entityId',
  //     as: 'courseActivities'
  //   });

  //   Course.hasMany(models.Assignment, {
  //     as: 'assignments',
  //     foreignKey: 'courseId'
  //   });

  // }

  return Course;
};