const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Testimonial = sequelize.define('Testimonial', {
    testimonialId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [10, 2000],
        notEmpty: true,
      },
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
    },
    featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    source: {
      type: DataTypes.ENUM('platform', 'external'),
      defaultValue: 'platform',
    },
    externalAuthor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    externalRole: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    externalAvatarUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true,
      },
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    timestamps: true,
    tableName: 'testimonials',
    indexes: [
      {
        fields: ['status'],
      },
      {
        fields: ['featured'],
      },
      {
        fields: ['userId'],
      },
    ],
  });

  Testimonial.associate = (models) => {
    Testimonial.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'author',
    });
  };

  return Testimonial;
};