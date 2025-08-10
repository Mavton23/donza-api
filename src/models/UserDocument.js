const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const UserDocument = sequelize.define('UserDocument', {
    docId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    tempUserId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    documentType: {
      type: DataTypes.ENUM(
        'alvara',
        'credenciamento',
        'estatutos',
        'endereco',
        'nuit',
        'diplomas',
        'experiencia',
        'identidade',
        'cv',
        'certificacoes',
        'comprovante_matricula',
        'registroProfissional',
        'other'
      ),
      allowNull: false
    },
    originalName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    storageKey: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    storageProvider: {
      type: DataTypes.STRING,
      defaultValue: 'cloudinary'
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending'
    },
    reviewedBy: {
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
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    timestamps: true,
    tableName: 'user_documents',
    indexes: [
      {
        fields: ['userId', 'documentType']
      },
      {
        fields: ['status']
      }
    ]
  });

  UserDocument.associate = models => {
    UserDocument.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
    UserDocument.belongsTo(models.User, {
      foreignKey: 'reviewedBy',
      as: 'reviewer'
    });
  };

  return UserDocument;
};