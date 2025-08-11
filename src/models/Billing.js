const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Billing = sequelize.define('Billing', {
    billingId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    institutionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'userId'
      }
    },
    plan: {
      type: DataTypes.ENUM('free', 'basic', 'premium', 'enterprise'),
      defaultValue: 'free',
    },
    status: {
      type: DataTypes.ENUM('active', 'past_due', 'canceled', 'incomplete'),
      defaultValue: 'incomplete',
    },
    paymentMethod: {
      type: DataTypes.ENUM('credit_card', 'pix', 'bank_transfer', 'boleto'),
      allowNull: true,
    },
    cardLast4: {
      type: DataTypes.STRING(4),
      allowNull: true,
      validate: {
        is: /^\d{4}$/
      }
    },
    currentPeriodStart: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    currentPeriodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    cancelAtPeriodEnd: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    timestamps: true,
    tableName: 'billings',
    // indexes: [
    //   {
    //     fields: ['institutionId'],
    //   },
    //   {
    //     fields: ['status'],
    //   },
    //   {
    //     fields: ['externalId'],
    //     unique: true
    //   }
    // ],
    hooks: {
      beforeCreate: async (billing) => {
        if (!billing.currentPeriodEnd) {
          billing.currentPeriodEnd = new Date(
            new Date(billing.currentPeriodStart).setMonth(
              new Date(billing.currentPeriodStart).getMonth() + 1
            )
          );
        }
      }
    }
  });

  // Billing.associate = (models) => {
  //   Billing.belongsTo(models.User, {
  //     foreignKey: 'institutionId',
  //     as: 'institution',
  //     onDelete: 'CASCADE'
  //   });

  //   Billing.hasMany(models.Invoice, {
  //     foreignKey: 'billingId',
  //     as: 'invoices'
  //   });
  // };

  return Billing;
};