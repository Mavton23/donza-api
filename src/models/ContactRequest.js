const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const ContactRequest = sequelize.define('ContactRequest', {
    requestId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    contactMethod: {
      type: DataTypes.ENUM('email', 'chat', 'callback'),
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    preferredTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'resolved'),
      defaultValue: 'pending'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'userId'
      }
    }
  }, {
    tableName: 'contact_requests',
    timestamps: true,
    // indexes: [
    //   {
    //     fields: ['status']
    //   },
    //   {
    //     fields: ['contactMethod']
    //   },
    //   {
    //     fields: ['userId']
    //   },
    //   {
    //     fields: ['createdAt']
    //   }
    // ]
  });

  // ContactRequest.associate = (models) => {
  //   ContactRequest.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'user'
  //   });
  //   ContactRequest.belongsTo(models.User, {
  //     foreignKey: 'updatedBy',
  //     as: 'updatedByUser'
  //   });
  // };

  return ContactRequest;
};