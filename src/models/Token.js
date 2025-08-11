const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Token = sequelize.define('Token', {
        tokenId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false
        },
        revoked: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        timestamps: true,
        tableName: 'tokens',
        indexes: [
            {
                fields: ['token'],
                unique: true
            },
            {
                fields: ['userId']
            },
            {
                fields: ['expiresAt']
            }
        ]
    });

    // Token.associate = (models) => {
    //     Token.belongsTo(models.User, {
    //         foreignKey: 'userId',
    //         as: 'user'
    //     });
    // }

    return Token;
};