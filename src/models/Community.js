const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Community = sequelize.define('Community', {
    communityId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [3, 50],
      },
      unique: true
    },
    slug: {
      type: DataTypes.STRING,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/
      }
    },
    description: {
      type: DataTypes.TEXT,
      validate: {
        len: [0, 500]
      }
    },
    shortDescription: {
      type: DataTypes.STRING(100),
      validate: {
        len: [0, 100]
      }
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    coverImage: {
      type: DataTypes.STRING
    },
    thumbnailImage: {
      type: DataTypes.STRING
    },
    rules: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    membershipType: {
      type: DataTypes.ENUM('open', 'approval', 'invite_only'),
      defaultValue: 'open'
    },
    status: {
      type: DataTypes.ENUM('active', 'archived', 'suspended'),
      defaultValue: 'active'
    },
    socialLinks: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    analytics: {
      type: DataTypes.JSON,
      defaultValue: {
        memberCount: 0,
        postCount: 0,
        engagementRate: 0
      }
    }
  }, {
    tableName: 'communities',
    timestamps: true,
    paranoid: true,
    // indexes: [
    //   {
    //     unique: true,
    //     fields: ['slug']
    //   },
    //   {
    //     fields: ['tags']
    //   }
    // ]
  });
  
    // Community.associate = (models) => {
    //     Community.belongsToMany(models.User, {
    //         through: models.CommunityMember,
    //         as: 'members'
    //     });
    //   Community.belongsTo(models.User, {
    //     foreignKey: 'creatorId',
    //     as: 'creator'
    //   });
    //   Community.hasMany(models.StudyGroup, {
    //     foreignKey: 'communityId',
    //     as: 'studyGroups'
    //   });
    //   Community.hasMany(models.CommunityPost, {
    //     foreignKey: 'communityId',
    //     as: 'posts'
    //   });
    //   Community.hasMany(models.CommunityInvite, {
    //     foreignKey: 'communityId',
    //     as: 'invites'
    //   });
      
    //   Community.hasMany(models.CommunityRole, {
    //     foreignKey: 'communityId',
    //     as: 'roles'
    //   });
    // };
  
    return Community;
  };