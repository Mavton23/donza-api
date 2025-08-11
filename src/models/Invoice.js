const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    invoiceId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'BRL',
    },
    status: {
      type: DataTypes.ENUM('draft', 'open', 'paid', 'void', 'uncollectible'),
      defaultValue: 'draft',
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pdfUrl: {
      type: DataTypes.STRING,
      validate: {
        isUrl: true,
      },
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    items: {
      type: DataTypes.JSONB,
      defaultValue: []
    }
  }, {
    tableName: 'invoices',
    // indexes: [
    //   {
    //     fields: ['billingId'],
    //   },
    //   {
    //     fields: ['status'],
    //   }
    // ]
  });

  Invoice.associate = (models) => {
    Invoice.belongsTo(models.Billing, {
      foreignKey: 'billingId',
      as: 'billing'
    });
  };

  return Invoice;
};