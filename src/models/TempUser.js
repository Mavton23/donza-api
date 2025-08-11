const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const TempUser = sequelize.define('TempUser', {
    tempId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
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
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tokenExpires: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    role: {
      type: DataTypes.ENUM('student', 'instructor', 'institution'),
      defaultValue: 'student',
    },
    potentialUsername: {
      type: DataTypes.STRING,
      validate: {
        len: [3, 30],
        is: /^[a-zA-Z0-9_]+$/,
      },
    },
    potentialFullname: {
      type: DataTypes.STRING,
      allowNull: true
    },
    potentialInstitutionName: {
      type: DataTypes.STRING
    },
    educationLevel: {
      type: DataTypes.ENUM('graduation', 'specialization', 'masters', 'phd'),
      allowNull: true
    },
    educationField: {
      type: DataTypes.STRING,
      allowNull: true
    },
    potentialNuit: {
      type: DataTypes.STRING
    },
    legalRepresentative: {
      type: DataTypes.STRING,
      allowNull: true
    },

    documents: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    
    ipAddress: DataTypes.STRING,
    userAgent: DataTypes.TEXT,
    verificationAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        max: 5
      }
    },
    registrationStatus: {
      type: DataTypes.ENUM('pending', 'documents_uploaded', 'completed'),
      defaultValue: 'pending'
    }
  }, {
    timestamps: true,
    tableName: 'temp_users',
    indexes: [
      {
        fields: ['email'],
        unique: true
      },
      {
        fields: ['verificationToken'],
        unique: true
      },
      {
        fields: ['tokenExpires']
      },
      {
        fields: ['isEmailVerified']
      },
      {
        fields: ['registrationStatus']
      }
    ],
    hooks: {
      beforeCreate: (tempUser) => {
        tempUser.tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      },
      beforeUpdate: (tempUser) => {
        if (tempUser.isEmailVerified) {
          tempUser.verificationAttempts = 0;
        }
        
        if (tempUser.documents && tempUser.documents.length > 0) {
          tempUser.registrationStatus = 'documents_uploaded';
        }
      }
    }
  });

  // TempUser.associate = models => {
  //   TempUser.hasMany(models.UserDocument, {
  //     foreignKey: 'tempUserId',
  //     as: 'tempDocuments'
  //   });
  // };

  return TempUser;
};