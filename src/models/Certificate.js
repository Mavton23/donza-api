const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Certificate = sequelize.define('Certificate', {
    certificateId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'userId'
      }
    },
    courseId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'courses',
        key: 'courseId'
      }
    },
    eventId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'events',
        key: 'eventId'
      }
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    issueDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    expirationDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    hours: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: false
    },
    downloadUrl: {
      type: DataTypes.STRING,
      allowNull: false
    },
    verificationUrl: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('issued', 'revoked', 'expired'),
      defaultValue: 'issued'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'certificates',
    // indexes: [
    //   {
    //     unique: true,
    //     fields: ['credentialId']
    //   },
    //   {
    //     fields: ['userId']
    //   },
    //   {
    //     fields: ['courseId']
    //   },
    //   {
    //     fields: ['eventId']
    //   },
    //   {
    //     fields: ['status']
    //   }
    // ]
  });

  Certificate.associate = (models) => {
    Certificate.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE'
    });
    
    Certificate.belongsTo(models.Course, {
      foreignKey: 'courseId',
      as: 'course',
      onDelete: 'SET NULL'
    });
    
    Certificate.belongsTo(models.Event, {
      foreignKey: 'eventId',
      as: 'event',
      onDelete: 'SET NULL'
    });
  };

  //Hooks para gerar credentialId único
  Certificate.beforeValidate((certificate) => {
    if (!certificate.credentialId) {
      const prefix = certificate.courseId ? 'CRS' : 'EVT';
      certificate.credentialId = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
  });

  return Certificate;
};