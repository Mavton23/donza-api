const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const MessageLimit = sequelize.define('MessageLimit', {
        userId: {
          type: DataTypes.UUID,
          primaryKey: true
        },
        date: {
          type: DataTypes.DATEONLY,
          primaryKey: true,
          defaultValue: DataTypes.NOW
        },
        count: {
          type: DataTypes.INTEGER,
          defaultValue: 0
        }
      });

    return MessageLimit;
}