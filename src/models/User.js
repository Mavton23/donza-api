const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    userId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 30],
        is: /^[a-zA-Z0-9_]+$/,
      },
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    educationLevel: {
      type: DataTypes.ENUM('graduation', 'specialization', 'masters', 'phd'),
      allowNull: true
    },
    educationField: {
      type: DataTypes.STRING,
      allowNull: true
    },
    nuit: {
      type: DataTypes.STRING,
      allowNull: true
    },
    legalRepresentative: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('student', 'instructor', 'admin', 'institution'),
      defaultValue: 'student',
    },
    avatarUrl: {
      type: DataTypes.STRING,
      validate: {
        isUrl: true,
      },
    },
    bio: {
      type: DataTypes.TEXT,
    },
    interests: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    expertise: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verificationToken: {
      type: DataTypes.STRING,
    },
    verifiedAt: {
      type: DataTypes.DATE,
    },
    lastLogin: {
      type: DataTypes.DATE,
    },
    profileCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    institutionName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    institutionType: {
      type: DataTypes.ENUM(
        'Universidade',
        'Faculdade',
        'Escola Técnica',
        'Centro de Pesquisa',
        'Plataforma Online',
        'ONG Educacional',
        'Outro'
      ),
      allowNull: true,
    },
    academicPrograms: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    website: {
      type: DataTypes.STRING,
      validate: {
        isUrl: true,
      },
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notificationPreferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        email: {
          eventReminders: true,
          taskDeadlines: true,
          newMessages: true,
          courseUpdates: false,
          reviewReplies: true
        },
        inApp: true
      }
    },
    messagePreferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        acceptsMessagesFromStudents: false,
        acceptsMessagesFromAll: false,  
        courseRelatedOnly: true,
        dailyMessageLimit: 5,
        allowAttachments: false
      }
    },
    socialMedia: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'suspended'),
      defaultValue: 'pending'
    },
    verificationData: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    adminReviewer: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'userId'
      }
    },
    reviewDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    accreditation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    yearFounded: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1000,
        max: new Date().getFullYear()
      }
    },
    teachingExperience: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      }
    },
  }, {
    timestamps: true,
    tableName: 'users',
    hooks: {
      beforeCreate: async (user) => {
        if (user.role === 'instructor') {
          user.status = 'pending'; 
        } else if (user.role === 'institution') {
          user.status = 'pending';
        } else {
          user.status = 'approved';
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('status') && ['approved', 'rejected'].includes(user.status)) {
          user.reviewDate = new Date();
        }
      }
    },
    indexes: [
      {
        name: 'users_role_index',
        fields: ['role'],
      },
      {
        name: 'users_status_verified_index',
        fields: ['role', 'isVerified', 'status'],
      },
      {
        name: 'users_username_search_index',
        fields: ['username'],
        using: 'BTREE',
      },
      {
        name: 'users_expertise_index',
        fields: ['expertise'],
        using: 'GIN',
      }
    ],
  });

  // User.associate = (models) => {
  //     User.hasMany(models.Token, {
  //       foreignKey: 'userId',
  //       as: 'tokens'
  //     });

  //     User.hasMany(models.UserRelationship, {
  //       foreignKey: 'userId',
  //       as: 'relationshipsInitiated',
  //     });
      
  //     User.hasMany(models.UserRelationship, {
  //       foreignKey: 'relatedUserId',
  //       as: 'relationshipsReceived',
  //     });

  //     User.hasMany(models.Activity, {
  //       foreignKey: 'userId',
  //       as: 'activities'
  //     });

  //     User.hasMany(models.Enrollment, {
  //       foreignKey: 'userId',
  //       as: 'enrollments'
  //     });

  //     User.belongsToMany(models.Course, {
  //       through: models.Enrollment,
  //       as: 'enrolledCourses',
  //       foreignKey: 'userId'
  //     });
    
  //     User.hasMany(models.Course, {
  //       as: 'taughtCourses',
  //       foreignKey: 'instructorId'
  //     });

  //     User.hasMany(models.Certificate, {
  //       foreignKey: 'userId',
  //       as: 'certificates'
  //     });

  //     User.hasMany(models.Review, {
  //       foreignKey: 'userId',
  //       as: 'reviews'
  //     });
    
  //     User.belongsToMany(models.Event, {
  //       through: models.EventParticipant,
  //       as: 'eventsAttended',
  //       foreignKey: 'userId',
  //     });
    
  //     User.hasMany(models.Event, {
  //       foreignKey: 'organizerId',
  //       as: 'organizedEvents'
  //     });

  //     User.belongsToMany(models.Conversation, {
  //       through: models.ConversationParticipant,
  //       as: 'conversations',
  //       foreignKey: 'userId'
  //     });

  //     User.hasMany(models.ChatMember, {
  //       foreignKey: 'userId',
  //       as: 'ChatMembers'
  //     });

  //     User.hasMany(models.Testimonial, {
  //       foreignKey: 'userId',
  //       as: 'testimonials'
  //     });

  //   // Relacionamento com instrutores (para instituições)
  //   User.belongsToMany(models.User, {
  //     through: models.InstitutionInstructor,
  //     as: 'instructors',
  //     foreignKey: 'institutionId',
  //     otherKey: 'instructorId',
  //     constraints: false,
  //     scope: {
  //       role: 'instructor'
  //     }
  //   });

  //   // Relacionamento com instituições (para instrutores)
  //   User.belongsToMany(models.User, {
  //     through: models.InstitutionInstructor,
  //     as: 'institutions',
  //     foreignKey: 'instructorId',
  //     otherKey: 'institutionId',
  //     constraints: false,
  //     scope: {
  //       role: 'institution'
  //     }
  //   });
    
  //   User.hasMany(models.UserDocument, {
  //     foreignKey: 'userId',
  //     as: 'documents'
  //   })

  //   // Relacionamento com o admin que revisou
  //   User.belongsTo(models.User, {
  //     foreignKey: 'adminReviewer',
  //     as: 'reviewedBy',
  //     constraints: false
  //   });
  // };

  return User;
};