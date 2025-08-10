const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const ContentScanResult = sequelize.define('ContentScanResult', {
        scanId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true
        },
        contentType: {
            type: DataTypes.ENUM('post', 'comment', 'resource', 'profile'),
            allowNull: false
        },
        scanType: {
            type: DataTypes.ENUM('automated', 'manual', 'userReport'),
            allowNull: false
        },
        riskScore: {
            type: DataTypes.FLOAT,
            defaultValue: 0
        },
        flaggedCategories: {
            type: DataTypes.ARRAY(DataTypes.STRING)
        },
        details: {
            type: DataTypes.JSONB
        },
        status: {
            type: DataTypes.ENUM('pending', 'reviewed', 'actioned', 'falsePositive'),
            defaultValue: 'pending'
        }
        }, {
            tableName: 'content_scan_results'
        }
    );

    return ContentScanResult;
}