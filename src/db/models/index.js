import { Sequelize, DataTypes, Op } from 'sequelize';
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { defaultLogger } from "../../utils/logger.js";

class Database {
    constructor() {
        this.sequelize = null;
        this.Users = null;
        this.Groups = null;
        this.GroupUsers = null;
        this.logger = globalThis.logger || defaultLogger || console;
        this.__dirname = dirname(fileURLToPath(import.meta.url));
        this.dbPath = join(this.__dirname, '../database/bot.sqlite');
    }

    /**
     * Initialize database connection and models
     */
    async init() {
        try {
            // Initialize Sequelize with SQLite
            this.sequelize = new Sequelize({
                dialect: 'sqlite',
                storage: this.dbPath,
                logging: false,
            });

            // Test the connection
            await this.sequelize.authenticate();
            this.logger.info('Kết nối cơ sở dữ liệu thành công!');

            // Define models
            this.defineModels();

            // Sync all models with database
            await this.sequelize.sync();
            this.logger.info('Đồng bộ hóa cơ sở dữ liệu thành công!');

            return this;
        } catch (error) {
            this.logger.error('❌ Lỗi kết nối cơ sở dữ liệu:', error);
            throw error;
        }
    }

    /**
     * Define database models
     */
    defineModels() {
        // User model (Currencies)
        this.Users = this.sequelize.define('Users', {
            userId: {
                type: DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            username: {
                type: DataTypes.STRING
            },
            displayName: {
                type: DataTypes.STRING
            },
            zaloName: {
                type: DataTypes.STRING
            },
            avatar: {
                type: DataTypes.STRING
            },
            exp: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            level: {
                type: DataTypes.INTEGER,
                defaultValue: 1
            },
            money: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            messageCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            banned: {
                type: DataTypes.INTEGER,  // Changed from BOOLEAN/TINYINT(1) to INTEGER
                defaultValue: 0           // Using 0 for false
            },
            banReason: {
                type: DataTypes.STRING,
                allowNull: true
            },
            banTime: {
                type: DataTypes.DATE,
                allowNull: true
            },
            lastActive: {
                type: DataTypes.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')  // Changed from fn('now') to literal
            },
            phoneNumber: {
                type: DataTypes.STRING,
                allowNull: true
            },
            gender: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            data: {
                type: DataTypes.TEXT,     // Changed from JSON to TEXT for better SQLite compatibility
                defaultValue: '{}',       // Store JSON as text string
                get() {
                    const rawValue = this.getDataValue('data');
                    return rawValue ? JSON.parse(rawValue) : {};
                },
                set(value) {
                    this.setDataValue('data', JSON.stringify(value));
                }
            }
        });

        // Group model
        this.Groups = this.sequelize.define('Groups', {
            groupId: {
                type: DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            name: {
                type: DataTypes.STRING
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            avatar: {
                type: DataTypes.STRING,
                allowNull: true
            },
            exp: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            level: {
                type: DataTypes.INTEGER,
                defaultValue: 1
            },
            messageCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            isActivated: {
                type: DataTypes.INTEGER,  // Changed from BOOLEAN to INTEGER
                defaultValue: 0           // Using 0 for false
            },
            creatorId: {
                type: DataTypes.STRING,
                allowNull: true
            },
            adminIds: {
                type: DataTypes.TEXT,     // Changed from JSON to TEXT
                defaultValue: '[]',
                get() {
                    const rawValue = this.getDataValue('adminIds');
                    return rawValue ? JSON.parse(rawValue) : [];
                },
                set(value) {
                    this.setDataValue('adminIds', JSON.stringify(value));
                }
            },
            settings: {
                type: DataTypes.TEXT,     // Changed from JSON to TEXT
                defaultValue: '{}',
                get() {
                    const rawValue = this.getDataValue('settings');
                    return rawValue ? JSON.parse(rawValue) : {};
                },
                set(value) {
                    this.setDataValue('settings', JSON.stringify(value));
                }
            },
            banned: {
                type: DataTypes.INTEGER,  // Changed from BOOLEAN to INTEGER
                defaultValue: 0
            },
            banReason: {
                type: DataTypes.STRING,
                allowNull: true
            },
            data: {
                type: DataTypes.TEXT,     // Changed from JSON to TEXT
                defaultValue: '{}',
                get() {
                    const rawValue = this.getDataValue('data');
                    return rawValue ? JSON.parse(rawValue) : {};
                },
                set(value) {
                    this.setDataValue('data', JSON.stringify(value));
                }
            }
        });

        // GroupUsers model (for many-to-many relationship)
        this.GroupUsers = this.sequelize.define('GroupUsers', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userId: {
                type: DataTypes.STRING,
                allowNull: false,
                references: {
                    model: this.Users,
                    key: 'userId'
                }
            },
            groupId: {
                type: DataTypes.STRING,
                allowNull: false,
                references: {
                    model: this.Groups,
                    key: 'groupId'
                }
            },
            exp: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            messageCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            role: {
                type: DataTypes.STRING,
                defaultValue: 'member' // 'member', 'admin', 'creator'
            },
            joinedAt: {
                type: DataTypes.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')  // Changed from fn('now') to literal
            },
            isMuted: {
                type: DataTypes.INTEGER,  // Changed from BOOLEAN to INTEGER
                defaultValue: 0
            },
            data: {
                type: DataTypes.TEXT,     // Changed from JSON to TEXT
                defaultValue: '{}',
                get() {
                    const rawValue = this.getDataValue('data');
                    return rawValue ? JSON.parse(rawValue) : {};
                },
                set(value) {
                    this.setDataValue('data', JSON.stringify(value));
                }
            }
        });

        // Define relationships
        this.Users.belongsToMany(this.Groups, { through: this.GroupUsers, foreignKey: 'userId' });
        this.Groups.belongsToMany(this.Users, { through: this.GroupUsers, foreignKey: 'groupId' });
    }

    /**
     * Calculate level based on experience points for users
     * @param {number} exp Experience points
     * @returns {number} Level
     */
    calculateLevel(exp) {
        // Simple level calculation formula: level = floor(sqrt(exp / 100)) + 1
        return Math.floor(Math.sqrt(exp / 100)) + 1;
    }

    /**
     * Calculate level based on experience points for groups (slower progression)
     * @param {number} exp Experience points
     * @returns {number} Level
     */
    calculateGroupLevel(exp) {
        // Modified level calculation formula for groups with slower progression
        // Using a higher divisor (300 instead of 100) makes leveling slower
        return Math.floor(Math.sqrt(exp / 300)) + 1;
    }

    /**
     * Calculate experience needed for next level for users
     * @param {number} level Current level
     * @returns {number} Experience needed for next level
     */
    expForNextLevel(level) {
        return Math.pow(level, 2) * 100;
    }

    /**
     * Calculate experience needed for next level for groups
     * @param {number} level Current level
     * @returns {number} Experience needed for next level
     */
    expForNextGroupLevel(level) {
        // Groups need 3x more experience to level up
        return Math.pow(level, 2) * 300;
    }

    /**
     * Get or create user in database from Zalo user info
     * @param {string} userId User ID
     * @param {Object} userInfo User info from Zalo API (optional)
     * @returns {Promise<Object>} User object
     */
    async getOrCreateUser(userId, userInfo) {
        try {
            let user = await this.Users.findByPk(userId);

            if (!user) {
                // Create new user
                const userData = {
                    userId: userId,
                    username: userInfo?.username || userId,
                    displayName: userInfo?.displayName || userId,
                    zaloName: userInfo?.zaloName || null,
                    avatar: userInfo?.avatar || null,
                    phoneNumber: userInfo?.phoneNumber || null,
                    gender: userInfo?.gender || null
                };

                user = await this.Users.create(userData);
                this.logger.info(`✅ Đã tạo người dùng mới: ${userId}`);

                // Add user ID to global data
                if (!global.data.allUserID.includes(userId)) {
                    global.data.allUserID.push(userId);
                    global.data.allCurrenciesID.push(userId);
                }
            } else if (userInfo) {
                // Update user info if provided
                await user.update({
                    username: userInfo.username || user.username,
                    displayName: userInfo.displayName || user.displayName,
                    zaloName: userInfo.zaloName || user.zaloName,
                    avatar: userInfo.avatar || user.avatar,
                    phoneNumber: userInfo.phoneNumber || user.phoneNumber,
                    gender: userInfo.gender !== undefined ? userInfo.gender : user.gender,
                    lastActive: new Date()
                });
            }

            return user;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi lấy/tạo người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get or create group in database from Zalo group info
     * @param {string} groupId Group ID
     * @param {Object} groupInfo Group info from Zalo API (optional)
     * @returns {Promise<Object>} Group object
     */
    async getOrCreateGroup(groupId, groupInfo = null) {
        try {
            let group = await this.Groups.findByPk(groupId);

            if (!group) {
                // Create new group
                const groupData = {
                    groupId: groupId,
                    name: groupInfo?.name || `Group ${groupId}`,
                    description: groupInfo?.desc || null,
                    avatar: groupInfo?.avt || null,
                    creatorId: groupInfo?.creatorId || null,
                    adminIds: groupInfo?.adminIds || []
                };

                group = await this.Groups.create(groupData);
                this.logger.info(`✅ Đã tạo nhóm mới: ${groupId}`);

                // Add group ID to global data
                if (!global.data.allThreadID.includes(groupId)) {
                    global.data.allThreadID.push(groupId);
                }
            } else if (groupInfo) {
                // Update group info if provided
                await group.update({
                    name: groupInfo.name || group.name,
                    description: groupInfo.desc || group.description,
                    avatar: groupInfo.avt || group.avatar,
                    creatorId: groupInfo.creatorId || group.creatorId,
                    adminIds: groupInfo.adminIds || group.adminIds
                });
            }

            return group;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi lấy/tạo nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Add user to group or update relationship
     * @param {string} userId User ID
     * @param {string} groupId Group ID
     * @param {string} role User role in group
     * @returns {Promise<Object>} GroupUser object
     */
    async addUserToGroup(userId, groupId, role = 'member') {
        try {
            // Make sure user and group exist
            await this.getOrCreateUser(userId);
            await this.getOrCreateGroup(groupId);

            // Find or create GroupUser relationship
            const [groupUser, created] = await this.GroupUsers.findOrCreate({
                where: { userId, groupId },
                defaults: { role }
            });

            if (!created && groupUser.role !== role) {
                await groupUser.update({ role });
            }

            return groupUser;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi thêm user ${userId} vào nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Remove user from group
     * @param {string} userId User ID
     * @param {string} groupId Group ID
     * @returns {Promise<boolean>} Success
     */
    async removeUserFromGroup(userId, groupId) {
        try {
            const deleted = await this.GroupUsers.destroy({
                where: { userId, groupId }
            });

            return deleted > 0;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi xóa user ${userId} khỏi nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Increase user experience and message count
     * @param {string} userId User ID
     * @param {number} expGain Experience to add
     * @returns {Promise<Object>} Updated user and level up information
     */
    async increaseUserExp(userId, expGain = 1) {
        try {
            const user = await this.getOrCreateUser(userId);
            const oldLevel = user.level;
            const newExp = user.exp + expGain;
            const newMessageCount = user.messageCount + 1;
            const newLevel = this.calculateLevel(newExp);

            await user.update({
                exp: newExp,
                level: newLevel,
                messageCount: newMessageCount,
                lastActive: new Date()
            });

            const levelUp = newLevel > oldLevel;

            return {
                user,
                levelUp,
                oldLevel,
                newLevel
            };
        } catch (error) {
            this.logger.error(`❌ Lỗi khi tăng exp cho người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Increase group experience and message count with slower progression
     * @param {string} groupId Group ID
     * @param {number} expGain Experience to add
     * @returns {Promise<Object>} Updated group and level up information
     */
    async increaseGroupExp(groupId, expGain = 1) {
        try {
            const group = await this.getOrCreateGroup(groupId);
            const oldLevel = group.level;

            // Apply a reduction factor to group exp gain (now only gaining 1/3 of the experience)
            const reducedExpGain = Math.max(1, Math.floor(expGain / 3));
            const newExp = group.exp + reducedExpGain;
            const newMessageCount = group.messageCount + 1;

            // Use the slower group level calculation
            const newLevel = this.calculateGroupLevel(newExp);

            await group.update({
                exp: newExp,
                level: newLevel,
                messageCount: newMessageCount
            });

            const levelUp = newLevel > oldLevel;

            return {
                group,
                levelUp,
                oldLevel,
                newLevel,
                expGain: reducedExpGain // Return the actual exp gained after reduction
            };
        } catch (error) {
            this.logger.error(`❌ Lỗi khi tăng exp cho nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Increase user experience in a specific group
     * @param {string} userId User ID
     * @param {string} groupId Group ID
     * @param {number} expGain Experience to add
     * @returns {Promise<Object>} Updated GroupUser object
     */
    async increaseGroupUserExp(userId, groupId, expGain = 1) {
        try {
            let groupUser = await this.GroupUsers.findOne({
                where: { userId, groupId }
            });

            if (!groupUser) {
                groupUser = await this.addUserToGroup(userId, groupId);
            }

            await groupUser.update({
                exp: groupUser.exp + expGain,
                messageCount: groupUser.messageCount + 1
            });

            return groupUser;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi tăng exp cho user ${userId} trong nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Process a message to update experience and message counts
     * @param {string} userId User ID
     * @param {string} groupId Group ID (optional, for group messages)
     * @returns {Promise<Object>} Result with level up information
     */
    async processMessage(userId, groupId = null) {
        try {
            // Random exp gain between 1-3
            const expGain = Math.floor(Math.random() * 3) + 1;

            // Update user experience and message count
            const userResult = await this.increaseUserExp(userId, expGain);

            let groupResult = null;
            let groupUserResult = null;

            // If this is a group message, update group and group-user experience
            if (groupId) {
                groupResult = await this.increaseGroupExp(groupId, expGain);
                groupUserResult = await this.increaseGroupUserExp(userId, groupId, expGain);
            }

            return {
                user: userResult,
                group: groupResult,
                groupUser: groupUserResult,
                expGain
            };
        } catch (error) {
            this.logger.error(`❌ Lỗi khi xử lý tin nhắn từ user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get top users by experience
     * @param {number} limit Number of users to return
     * @returns {Promise<Array>} Top users
     */
    async getTopUsers(limit = 10) {
        try {
            return await this.Users.findAll({
                order: [['exp', 'DESC']],
                limit
            });
        } catch (error) {
            this.logger.error('❌ Lỗi khi lấy top người dùng:', error);
            throw error;
        }
    }

    /**
     * Get top groups by experience
     * @param {number} limit Number of groups to return
     * @returns {Promise<Array>} Top groups
     */
    async getTopGroups(limit = 10) {
        try {
            return await this.Groups.findAll({
                order: [['exp', 'DESC']],
                limit
            });
        } catch (error) {
            this.logger.error('❌ Lỗi khi lấy top nhóm:', error);
            throw error;
        }
    }

    /**
     * Get top users in a specific group
     * @param {string} groupId Group ID
     * @param {number} limit Number of users to return
     * @returns {Promise<Array>} Top users in group
     */
    async getTopUsersInGroup(groupId, limit = 10) {
        try {
            return await this.GroupUsers.findAll({
                where: { groupId },
                order: [['exp', 'DESC']],
                limit,
                include: [this.Users]
            });
        } catch (error) {
            this.logger.error(`❌ Lỗi khi lấy top người dùng trong nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Ban a user
     * @param {string} userId User ID
     * @param {string} reason Ban reason
     * @param {Date} banTime Ban until time (optional)
     * @returns {Promise<Object>} Updated user
     */
    async banUser(userId, reason = null, banTime = null) {
        try {
            const user = await this.getOrCreateUser(userId);

            await user.update({
                banned: 1,  // Changed from true to 1
                banReason: reason,
                banTime: banTime
            });

            // Update global data
            global.data.userBanned.set(userId, {
                reason: reason,
                time: banTime
            });

            return user;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi cấm người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Unban a user
     * @param {string} userId User ID
     * @returns {Promise<Object>} Updated user
     */
    async unbanUser(userId) {
        try {
            const user = await this.getOrCreateUser(userId);

            await user.update({
                banned: 0,  // Changed from false to 0
                banReason: null,
                banTime: null
            });

            // Update global data
            global.data.userBanned.delete(userId);

            return user;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi bỏ cấm người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Ban a group
     * @param {string} groupId Group ID
     * @param {string} reason Ban reason
     * @returns {Promise<Object>} Updated group
     */
    async banGroup(groupId, reason = null) {
        try {
            const group = await this.getOrCreateGroup(groupId);

            await group.update({
                banned: 1,  // Changed from true to 1
                banReason: reason
            });

            // Update global data
            global.data.threadBanned.set(groupId, {
                reason: reason
            });

            return group;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi cấm nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Unban a group
     * @param {string} groupId Group ID
     * @returns {Promise<Object>} Updated group
     */
    async unbanGroup(groupId) {
        try {
            const group = await this.getOrCreateGroup(groupId);

            await group.update({
                banned: 0,  // Changed from false to 0
                banReason: null
            });

            // Update global data
            global.data.threadBanned.delete(groupId);

            return group;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi bỏ cấm nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Add money to user
     * @param {string} userId User ID
     * @param {number} amount Amount to add
     * @returns {Promise<Object>} Updated user
     */
    async addMoney(userId, amount) {
        try {
            const user = await this.getOrCreateUser(userId);

            await user.update({
                money: user.money + amount
            });

            return user;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi thêm tiền cho người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Remove money from user
     * @param {string} userId User ID
     * @param {number} amount Amount to remove
     * @returns {Promise<Object>} Updated user or false if not enough money
     */
    async removeMoney(userId, amount) {
        try {
            const user = await this.getOrCreateUser(userId);

            if (user.money < amount) {
                return false; // Not enough money
            }

            await user.update({
                money: user.money - amount
            });

            return user;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi trừ tiền người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Set money for user
     * @param {string} userId User ID
     * @param {number} amount New amount
     * @returns {Promise<Object>} Updated user
     */
    async setMoney(userId, amount) {
        try {
            const user = await this.getOrCreateUser(userId);

            await user.update({
                money: amount
            });

            return user;
        } catch (error) {
            this.logger.error(`❌ Lỗi khi đặt tiền người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Transfer money between users
     * @param {string} fromId Sender user ID
     * @param {string} toId Recipient user ID
     * @param {number} amount Amount to transfer
     * @returns {Promise<Object>} Result object
     */
    async transferMoney(fromId, toId, amount) {
        try {
            const fromUser = await this.getOrCreateUser(fromId);

            if (fromUser.money < amount) {
                return {
                    success: false,
                    reason: 'not_enough_money'
                };
            }

            const toUser = await this.getOrCreateUser(toId);

            await this.sequelize.transaction(async (t) => {
                await fromUser.update({
                    money: fromUser.money - amount
                }, { transaction: t });

                await toUser.update({
                    money: toUser.money + amount
                }, { transaction: t });
            });

            return {
                success: true,
                fromUser,
                toUser,
                amount
            };
        } catch (error) {
            this.logger.error(`❌ Lỗi khi chuyển tiền từ ${fromId} tới ${toId}:`, error);
            throw error;
        }
    }

    /**
     * Get user rank position
     * @param {string} userId User ID
     * @returns {Promise<Object>} Rank information
     */
    async getUserRank(userId) {
        try {
            // Get all users ordered by exp
            const allUsers = await this.Users.findAll({
                order: [['exp', 'DESC']]
            });

            // Find user position
            const position = allUsers.findIndex(user => user.userId === userId) + 1;
            const user = allUsers[position - 1];

            if (!user) {
                return {
                    success: false,
                    reason: 'user_not_found'
                };
            }

            // Calculate progress to next level
            const currentLevelExp = this.expForNextLevel(user.level - 1);
            const nextLevelExp = this.expForNextLevel(user.level);
            const expNeeded = nextLevelExp - currentLevelExp;
            const expProgress = user.exp - currentLevelExp;
            const progressPercent = Math.floor((expProgress / expNeeded) * 100);

            return {
                success: true,
                user,
                position,
                totalUsers: allUsers.length,
                expNeeded,
                expProgress,
                progressPercent
            };
        } catch (error) {
            this.logger.error(`❌ Lỗi khi lấy xếp hạng người dùng ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get group rank information
     * @param {string} groupId Group ID
     * @returns {Promise<Object>} Group rank information
     */
    async getGroupRank(groupId) {
        try {
            // Get all groups ordered by exp
            const allGroups = await this.Groups.findAll({
                order: [['exp', 'DESC']]
            });

            // Find group position
            const position = allGroups.findIndex(group => group.groupId === groupId) + 1;
            const group = allGroups[position - 1];

            if (!group) {
                return {
                    success: false,
                    reason: 'group_not_found'
                };
            }

            // Calculate progress to next level using group-specific formula
            const currentLevelExp = this.expForNextGroupLevel(group.level - 1);
            const nextLevelExp = this.expForNextGroupLevel(group.level);
            const expNeeded = nextLevelExp - currentLevelExp;
            const expProgress = group.exp - currentLevelExp;
            const progressPercent = Math.floor((expProgress / expNeeded) * 100);

            return {
                success: true,
                group,
                position,
                totalGroups: allGroups.length,
                expNeeded,
                expProgress,
                progressPercent
            };
        } catch (error) {
            this.logger.error(`❌ Lỗi khi lấy xếp hạng nhóm ${groupId}:`, error);
            throw error;
        }
    }

    /**
     * Synchronize data from Zalo API to database
     * @param {Object} api Zalo API object
     */
    async syncData(api) {
        try {
            this.logger.info('🔄 Bắt đầu đồng bộ hóa dữ liệu từ Zalo API...');
            // Get all groups
            const groups = await api.getAllGroups();
            console.log(groups)
            if (groups && groups.gridInfoMap) {
                const groupIds = Object.keys(groups.gridInfoMap);

                this.logger.info(`🔄 Đồng bộ hóa ${groupIds.length} nhóm...`);

                // Process groups in batches to avoid rate limiting
                for (let i = 0; i < groupIds.length; i += 5) {
                    const batch = groupIds.slice(i, i + 5);
                    const groupInfo = await api.getGroupInfo(batch);

                    if (groupInfo && groupInfo.gridInfoMap) {
                        for (const [groupId, info] of Object.entries(groupInfo.gridInfoMap)) {
                            // Update group in database
                            await this.getOrCreateGroup(groupId, info);

                            // Process group members
                            if (info.memberIds && Array.isArray(info.memberIds)) {
                                this.logger.info(`🔄 Đồng bộ hóa ${info.memberIds.length} thành viên trong nhóm ${groupId}...`);

                                // Process members in batches
                                for (let j = 0; j < info.memberIds.length; j += 10) {
                                    const memberBatch = info.memberIds.slice(j, j + 10);

                                    try {
                                        const userInfo = await api.getUserInfo(memberBatch);

                                        if (userInfo && userInfo.changed_profiles) {
                                            for (const [userId, profile] of Object.entries(userInfo.changed_profiles)) {
                                                // Update user in database
                                                await this.getOrCreateUser(userId, profile);

                                                // Add user to group
                                                const role = info.adminIds?.includes(userId) ? 'admin' :
                                                    (info.creatorId === userId ? 'creator' : 'member');
                                                await this.addUserToGroup(userId, groupId, role);
                                            }
                                        }
                                    } catch (userError) {
                                        this.logger.error(`❌ Lỗi khi đồng bộ thông tin người dùng:`, userError);
                                    }

                                    // Add small delay to avoid rate limiting
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }
                        }
                    }

                    // Add delay between group batches
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            this.logger.info('✅ Đồng bộ hóa dữ liệu từ Zalo API hoàn tất!');
        } catch (error) {
            this.logger.error('❌ Lỗi khi đồng bộ hóa dữ liệu:', error);
            throw error;
        }
    }
}

export default Database;