const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const ms = require('ms');
const { Markup } = require('telegraf');

const TOKEN = "8103505258:AAHQoLsJdBLmo4JSkAT0REY0KGM8uQP6fYY"; // Replace with actual token
const OWNERS = new Set([7303763913]);
let db = new sqlite3.Database('./referral.db');
const COOLDOWN = 1000; // 1.5 seconds
db.on('trace', (sql) => console.log('Executing:', sql));
db.on('profile', (sql, time) => console.log(`Executed in ${time}ms:`, sql));

const bot = new Telegraf(TOKEN);
// Database initialization
db.serialize(() => {
    console.log("🔄 Initializing database...");

    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        is_bot BOOLEAN DEFAULT 0,
        referred_by INTEGER,
        referrals INTEGER DEFAULT 0,
        direct_referrals INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'users' table:", err);
        else console.log("✅ Users table initialized.");
    });

    // User Activity Table
    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
        user_id INTEGER,
        group_id INTEGER,
        activity_date DATE,
        message_count INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, group_id, activity_date)
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'user_activity' table:", err);
        else console.log("✅ User Activity table initialized.");
    });

    // Messages Table
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        message_id INTEGER PRIMARY KEY,
        user_id INTEGER,
        group_id INTEGER,
        message_type TEXT,
        "timestamp" DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_forwarded BOOLEAN DEFAULT 0,
        is_pinned BOOLEAN DEFAULT 0
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'messages' table:", err);
        else console.log("✅ Messages table initialized.");
    });
    
    // Admin Actions Table
    db.run(`CREATE TABLE IF NOT EXISTS admin_actions (
        action_id INTEGER PRIMARY KEY,
        admin_id INTEGER,
        group_id INTEGER,
        action_type TEXT,
        target_user_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'admin_actions' table:", err);
        else console.log("✅ Admin Actions table initialized.");
    });

    // Pinned Messages Table (Fixed DATETIME Issue)
    db.run(`CREATE TABLE IF NOT EXISTS pinned_messages (
        message_id INTEGER PRIMARY KEY,
        group_id INTEGER,
        pin_count INTEGER DEFAULT 0,
        last_interaction DATETIME DEFAULT NULL
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'pinned_messages' table:", err);
        else console.log("✅ Pinned Messages table initialized.");
    });

    // Groups Table
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        group_id INTEGER PRIMARY KEY,
        group_name TEXT,
        referral_code TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'groups' table:", err);
        else console.log("✅ Groups table initialized.");
    });

    // Referrals Table
    db.run(`CREATE TABLE IF NOT EXISTS referrals (
        referral_id TEXT PRIMARY KEY,
        referrer_id INTEGER,
        referee_id INTEGER,
        group_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'referrals' table:", err);
        else console.log("✅ Referrals table initialized.");
    });

    // Feedback Table
    db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY,
        message TEXT,
        group_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'feedback' table:", err);
        else console.log("✅ Feedback table initialized.");
    });

    // Verified Users Table
    db.run(`CREATE TABLE IF NOT EXISTS verified_users (
        user_id INTEGER PRIMARY KEY,
        verification_step INTEGER DEFAULT 0,
        verification_data TEXT DEFAULT NULL,
        attempts INTEGER DEFAULT 0,
        verified_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'verified_users' table:", err);
        else console.log("✅ Verified Users table initialized.");
    });

    // Temp Bans Table (Fixed PRIMARY KEY Issue)
    db.run(`CREATE TABLE IF NOT EXISTS temp_bans (
        user_id INTEGER,
        group_id INTEGER,
        reason TEXT,
        expires DATETIME,
        PRIMARY KEY(user_id, group_id)
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'temp_bans' table:", err);
        else console.log("✅ Temp Bans table initialized.");
    });

    // Warnings Table
    db.run(`CREATE TABLE IF NOT EXISTS warnings (
        user_id INTEGER,
        group_id INTEGER,
        reason TEXT,
        expires DATETIME,
        PRIMARY KEY(user_id, group_id)
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'warnings' table:", err);
        else console.log("✅ Warnings table initialized.");
    });
    

    // Audit Log Table
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY,
        action_type TEXT,
        user_id INTEGER,
        target_id INTEGER,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("❌ SQL Error in 'audit_log' table:", err);
        else console.log("✅ Audit Log table initialized.");
    });

    // Roles Table (Fixed PRIMARY KEY Issue)
    db.run(`CREATE TABLE IF NOT EXISTS roles (
        user_id INTEGER,
        group_id INTEGER,
        role TEXT,
        PRIMARY KEY(user_id, group_id)
    );`, (err) => {
        if (err) console.error("❌ SQL Error in 'roles' table:", err);
        else console.log("✅ Roles table initialized.");
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS group_settings (
        group_id INTEGER PRIMARY KEY,
        automod_enabled BOOLEAN DEFAULT 1,
        flood_threshold INTEGER DEFAULT 5,
        banned_words TEXT
    );`, (err) => {
        if (err) console.error("❌ SQL Error in 'group_settings' table:", err);
        else console.log("✅ group_settings table initialized.");
    });  

    db.run(`CREATE TABLE IF NOT EXISTS bot_owners (
        user_id INTEGER PRIMARY KEY
    );`, (err) => {
        if (err) console.error("❌ SQL Error in 'bot_owners' table:", err);
        else console.log("✅ Bot Owners table initialized.");
    });

    // Indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_refs ON users(referred_by)', (err) => {
        if (err) console.error("❌ SQL Error in 'idx_refs' index:", err);
    });

    db.run('CREATE INDEX IF NOT EXISTS idx_group_refs ON referrals(group_id)', (err) => {
        if (err) console.error("❌ SQL Error in 'idx_group_refs' index:", err);
    });

    db.run('CREATE INDEX IF NOT EXISTS idx_activity ON user_activity(activity_date)', (err) => {
        if (err) console.error("❌ SQL Error in 'idx_activity' index:", err);
    });

    db.run('CREATE INDEX IF NOT EXISTS idx_msg_metrics ON messages(group_id, timestamp)', (err) => {
        if (err) console.error("❌ SQL Error in 'idx_msg_metrics' index:", err);
    });
});

// Promisify database methods
['run', 'get', 'all'].forEach(method => {
    db[`${method}Async`] = (sql, params = []) => new Promise((resolve, reject) => {
        db[method](sql, params, (err, result) => err ? reject(err) : resolve(result));
    });

    db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
        console.log('Executing:', sql, params);  // Log every SQL command
        db.run(sql, params, function (err) {
            if (err) {
                console.error("❌ SQL Error:", err);
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
    
    db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
        console.log('Executing:', sql, params);
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error("❌ SQL Error:", err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
    
    db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
        console.log('Executing:', sql, params);
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error("❌ SQL Error:", err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
    
}); 

let ADMINS = new Set();
db.allAsync("SELECT user_id FROM bot_owners").then(rows => {
    rows.forEach(row => ADMINS.add(row.user_id));
    console.log("✅ Bot owners loaded:", ADMINS);
}).catch(err => console.error("❌ Error loading bot owners:", err));

bot.command('addowner', (ctx) => {
    if (!ctx.isOwner) return ctx.reply('❌ Only bot owners can use this command.');
    const newOwnerId = parseInt(ctx.message.text.split(' ')[1]);
    if (newOwnerId) {
        OWNERS.add(newOwnerId);
        ctx.reply(`✅ User ${newOwnerId} is now a bot owner.`);
    } else {
        ctx.reply('❌ Please provide a valid user ID.');
    }
});

bot.command('removeowner', (ctx) => {
    if (!ctx.isOwner) return ctx.reply('❌ Only bot owners can use this command.');
    const removeOwnerId = parseInt(ctx.message.text.split(' ')[1]);
    if (OWNERS.has(removeOwnerId)) {
        OWNERS.delete(removeOwnerId);
        ctx.reply(`✅ User ${removeOwnerId} is no longer a bot owner.`);
    } else {
        ctx.reply('❌ User is not an owner.');
    }
});

async function ensureBotOwner() {
    const owners = await db.allAsync('SELECT user_id FROM bot_owners');
    
    if (owners.length === 0) {
        const botOwnerId = 7303763913; // Replace with your Telegram ID
        await db.runAsync('INSERT INTO bot_owners (user_id) VALUES (?)', [botOwnerId]);
        console.log(`✅ Added default bot owner: ${botOwnerId}`);
    }
}

ensureBotOwner();


// 1. MODERATION SYSTEM IMPLEMENTATION
class ModerationSystem {
    constructor() {
        console.log("Moderation system initialized.");
    }

    async warnUser(userId, groupId, reason = 'Rule violation') {
        await db.runAsync(
            `INSERT INTO warnings (user_id, group_id, reason, expires) 
             VALUES (?, ?, ?, datetime('now', '+7 days'))
             ON CONFLICT(user_id, group_id) DO UPDATE SET reason = ?`,
            [userId, groupId, reason, reason]
        );        
        
        const warnings = await this.getWarnings(userId, groupId);
        if (warnings.length >= 3) {
            await this.tempMute(userId, groupId, '24 hours');
        }
    }

    async getWarnings(userId, groupId) {
        return db.allAsync(
            `SELECT * FROM warnings 
            WHERE user_id = ? AND group_id = ? 
            AND expires > datetime('now')`,
            [userId, groupId]
        );
    }

    async tempMute(ctx, userId, groupId, duration, reason = 'Rule violation') {
        if (!userId) {
            console.error("❌ Mute error: user_id is undefined");
            return ctx.reply("⚠️ Error: Invalid user ID.");
        }

        const expires = new Date(Date.now() + ms(duration));

        await db.runAsync(
            `INSERT INTO temp_bans (user_id, group_id, reason, expires)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, group_id) DO UPDATE SET expires = ?`,
            [userId, groupId, reason, expires, expires]
        );

        try {
            await ctx.telegram.restrictChatMember(groupId, userId, {
                until_date: Math.floor(expires.getTime() / 1000),
                permissions: {
                    can_send_messages: false,
                    can_send_media_messages: false,
                    can_send_other_messages: false
                }
            });
        } catch (error) {
            console.error("Mute error:", error);
            ctx.reply("❌ Failed to mute user. Check bot permissions.");
        }
    }

    startAutoUnmuteScheduler() {
        async function checkExpiredBans() {
            console.log("🔄 Checking for expired bans...");
        
            const expiredBans = await db.allAsync(
                `SELECT * FROM temp_bans WHERE expires <= datetime('now')`
            );
        
            for (const ban of expiredBans) {
                try {
                    await ctx.telegram.restrictChatMember(ban.group_id, ban.user_id, {
                        permissions: {
                            can_send_messages: true,
                            can_send_media_messages: true,
                            can_send_other_messages: true
                        }
                    });
        
                    await db.runAsync(
                        'DELETE FROM temp_bans WHERE user_id = ? AND group_id = ?',
                        [ban.user_id, ban.group_id]
                    );
        
                    console.log(`✅ User ${ban.user_id} unmuted in group ${ban.group_id}`);
        
                } catch (error) {
                    console.error(`❌ Failed to unmute user ${ban.user_id}:`, error);
                }
            }
        }
        
        setInterval(checkExpiredBans, 60000); // Run every 1 minute               
    }

    async unmute(userId, groupId) {
        await db.runAsync(
            `DELETE FROM temp_bans WHERE user_id = ? AND group_id = ?`,
            [userId, groupId]
        );
        console.log(`✅ User ${userId} unmuted in group ${groupId}`);
    }
}

// 2. WARNING SYSTEM ENHANCEMENTS
class WarningSystem {
    async getWarnings(userId, groupId) {
        return db.allAsync(
            `SELECT * FROM warnings 
            WHERE user_id = ? AND group_id = ? 
            AND expires > datetime('now')`,
            [userId, groupId]
        );
    }

    async addWarning(ctx, userId, groupId, reason) {
        const expires = new Date(Date.now() + ms('7 days'));
        await db.runAsync(
            `INSERT INTO warnings 
            (user_id, group_id, reason, expires)
            VALUES (?, ?, ?, ?)`,
            [userId, groupId, reason, expires]
        );

        const warnings = await this.getWarnings(userId, groupId);
        if (warnings.length >= 3) {
            await moderation.tempMute(ctx, userId, groupId, '24 hours', 
                'Automatic mute: 3 warnings');
        }
    }
}

// 3. VERIFICATION IMPROVEMENTS
class VerificationSystem {
    constructor() {
        // Cleanup abandoned sessions every hour
        setInterval(async () => {
            await db.runAsync(
                `DELETE FROM verified_users 
                WHERE verified_at IS NULL 
                AND created_at < datetime('now', '-1 hour')`
            );
        }, 3600000);
    }
}

// 4. AUTO-MODERATION FEATURES
class AutoModerator {
    constructor() {
        this.messageHistory = new Map();
    }

    async checkMessageFlood(ctx) {
        const key = `${ctx.chat.id}:${ctx.from.id}`;
        const now = Date.now();
    
        if (!this.messageHistory.has(key)) {
            this.messageHistory.set(key, []);
        }
    
        const timestamps = this.messageHistory.get(key);
        this.messageHistory.set(key, timestamps.filter(ts => now - ts < 10000)); // Remove old timestamps
        timestamps.push(now);
    
        if (timestamps.length > 5) {
            await moderation.tempMute(ctx, ctx.from.id, ctx.chat.id, '10 minutes', 'Message flood detected');
            return true;
        }
    
        return false;
    }    
}

// 5. SECURITY FEATURES
class SecuritySystem {
    constructor() {
        this.commandUsage = new Map();
    }

    checkRateLimit(userId, command) {
        const now = Date.now();
        const key = `${userId}:${command}`;
        
        if (!this.commandUsage.has(key)) {
            this.commandUsage.set(key, []);
        }

        const timestamps = this.commandUsage.get(key);
        timestamps.push(now);

        // Allow max 5 uses per minute
        return timestamps.filter(ts => now - ts < 60000).length <= 5;
    }
}

// 7. NOTIFICATION SYSTEM
class NotificationSystem {
    async sendPeakAlert(groupId) {
        const activity = await db.getAsync(
            `SELECT COUNT(*) as count 
            FROM messages 
            WHERE group_id = ? 
            AND timestamp > datetime('now', '-5 minutes')`,
            [groupId]
        );
        
        if (activity.count > 100) {
            ctx.telegram.sendMessage(
                groupId,
                `🚨 Peak activity alert: ${activity.count} messages in 5 minutes!`
            );
        }
    }
}

// 8. DATA MANAGEMENT
setInterval(async () => {
    // Cleanup messages older than 30 days
    await db.runAsync(
        `DELETE FROM messages 
        WHERE timestamp < datetime('now', '-30 days')`
    );
}, 86400000); // Daily cleanup

// 9. UI IMPROVEMENTS
bot.command('leaderboard', async (ctx) => {
    const page = parseInt(ctx.message.text.split(' ')[1]) || 1;
    const topUsers = await db.allAsync(
        `SELECT username, direct_referrals 
        FROM users 
        ORDER BY direct_referrals DESC 
        LIMIT 10 OFFSET ${(page - 1) * 10}`
    );

    const leaderboardText = `🏆 *Leaderboard - Page ${page}*\n\n` +
        topUsers.map((u, i) => `${(page - 1) * 10 + i + 1}. ${u.username || 'Anonymous'} - ${u.direct_referrals} referrals`).join('\n');

    const buttons = [];
    if (page > 1) buttons.push(Markup.button.callback('⬅️ Previous', `page_${page - 1}`));
    if (topUsers.length === 10) buttons.push(Markup.button.callback('➡️ Next', `page_${page + 1}`));

    ctx.replyWithMarkdown(leaderboardText, Markup.inlineKeyboard(buttons));
});

// 10. ERROR HANDLING IMPROVEMENTS
process.on('uncaughtException', async (err) => {
    console.error('Critical Error:', err);
    db.close();
    db = new sqlite3.Database('./referral.db', (err) => {
        if (!err) console.log('Database reconnected');
    });
});


db.runAsync = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

bot.command('guide', (ctx) => {
    ctx.replyWithMarkdown(`📘 *Admin Quickstart Guide*\n\n` +
        `1. Use /addgroup to register your group\n` +
        `2. Configure automod with /automod\n` +
        `3. Monitor activity with /groupstats\n` +
        `4. Manage users with /warn and /mute\n\n` +
        `[View Full Documentation](https://example.com/docs)`);
});

bot.command('donate', async (ctx) => {
    const donationMessage = `💰 *Support Our Bot!* \n\n` +
        `If you enjoy using this bot, consider donating to keep it running.\n\n` +
        `Accepted Cryptos: \n` +
        `- BTC: \`your_btc_address_here\`\n` +
        `- ETH: \`your_eth_address_here\`\n` +
        `- USDT (TRC20): \`your_usdt_trc20_address_here\`\n\n` +
        `Thank you for your support! 🙏`;
    
    ctx.replyWithMarkdown(donationMessage);
});

bot.command('advertise', async (ctx) => {
    const advertiseMessage = `📢 *Advertise with Us!* \n\n` +
        `We offer advertisement space in our bot and community groups.\n\n` +
        `💲 Pricing (in USDT):\n` +
        `- Basic Ad (1 Day): 10 USDT\n` +
        `- Premium Ad (Pinned for 1 Week): 50 USDT\n\n` +
        `Payment: USDT (TRC20) - \`your_usdt_trc20_address_here\`\n\n` +
        `Contact @your_admin_username for custom deals!`;
    
    ctx.replyWithMarkdown(advertiseMessage);
});


// Initialize systems
const moderation = new ModerationSystem();
const warnings = new WarningSystem();
const automod = new AutoModerator();
const security = new SecuritySystem();

moderation.startAutoUnmuteScheduler();

class ReferralManager {
    async getUser(userId) {
        return db.getAsync('SELECT * FROM users WHERE user_id = ?', [userId]);
    }

    async createUser(user, referrerId = null) {
        await db.runAsync(
            `INSERT INTO users (user_id, username, is_bot, referred_by) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
            username = ?, is_bot = ?`,
            [user.id, user.username, user.is_bot || false, referrerId, user.username, user.is_bot || false]
        );        
    }

    async getGroup(groupId) {
        return db.getAsync('SELECT * FROM groups WHERE group_id = ?', [groupId]);
    }

    async handleGroupJoin(groupId, userId, referralCode) {
        const group = await db.getAsync(
            'SELECT * FROM groups WHERE referral_code = ?',
            [referralCode]
        );
        
        if (group && group.group_id === groupId) {
            await db.runAsync(
                `INSERT INTO referrals (referral_id, referrer_id, referee_id, group_id)
                VALUES (?, ?, ?, ?)`,
                [uuidv4(), groupId, userId, groupId]
            );
            return true;
        }
        return false;
    }

    // Referral Handling
    async addReferral(referrerId, refereeId, groupId = null) {
        await db.runAsync('BEGIN TRANSACTION');
        try {
            await db.runAsync(
                `UPDATE users SET 
                referrals = referrals + 1,
                direct_referrals = direct_referrals + 1 
                WHERE user_id = ?`,
                [referrerId]
            );
            
            await db.runAsync(
                `INSERT INTO referrals (referral_id, referrer_id, referee_id, group_id)
                VALUES (?, ?, ?, ?)`,
                [uuidv4(), referrerId, refereeId, groupId]
            );
            
            await db.runAsync('COMMIT');
        } catch (err) {
            await db.runAsync('ROLLBACK');
            throw err;
        }
    }

    // Group Management
    async createGroup(groupId, groupName) {
        const referralCode = uuidv4().slice(0, 8);
        await db.runAsync(
            `INSERT INTO groups (group_id, group_name, referral_code)
            VALUES (?, ?, ?)
            ON CONFLICT(group_id) DO UPDATE SET
            group_name = excluded.group_name,
            referral_code = excluded.referral_code`,
            [groupId, groupName, referralCode]
        );
        return referralCode;
    }
}

const manager = new ReferralManager();
const cooldowns = new Map();


class AnalyticsManager {
    // User Engagement Metrics
    async trackUserActivity(ctx) {
        if (!ctx.message || !ctx.chat) return;
        
        await db.runAsync(
            `INSERT INTO user_activity (user_id, group_id, activity_date, message_count)
            VALUES (?, ?, DATE('now'), 1)
            ON CONFLICT(user_id, group_id, activity_date) DO UPDATE SET
            message_count = message_count + 1`,
            [ctx.from.id, ctx.chat.id]
        );
    }

    async getGroupDAU(groupId) {
        return db.getAsync(
            `SELECT COUNT(DISTINCT user_id) as dau 
            FROM user_activity 
            WHERE group_id = ? AND activity_date = DATE('now')`,
            [groupId]
        );
    }

    async getEngagementRate(groupId) {
        return db.getAsync(
            `SELECT 
                COUNT(DISTINCT user_id) as active_users,
                SUM(message_count) as total_messages
            FROM user_activity 
            WHERE group_id = ? AND activity_date >= DATE('now', '-7 days')`,
            [groupId]
        );
    }

    // Message Analytics
    async trackMessage(ctx) {
        const msgType = this.getMessageType(ctx.message);
        await db.runAsync(
            `INSERT INTO messages 
            (user_id, group_id, message_type, is_forwarded, is_pinned)
            VALUES (?, ?, ?, ?, ?)`,
            [ctx.from.id, ctx.chat.id, msgType, ctx.message.forward_date ? 1 : 0, 0]
        );
    }

    getMessageType(message) {
        if (message.photo) return 'photo';
        if (message.video) return 'video';
        if (message.document) return 'document';
        if (message.text && message.entities) {
            return message.entities.some(e => e.type === 'url') ? 'link' : 'text';
        }
        return 'other';
    }

    // Admin Tracking
    async trackAdminAction(ctx, actionType, targetUserId) {
        await db.runAsync(
            `INSERT INTO admin_actions 
            (admin_id, group_id, action_type, target_user_id)
            VALUES (?, ?, ?, ?)`,
            [ctx.from.id, ctx.chat.id, actionType, targetUserId]
        );
    }

    // Growth Insights
    async calculateLTV(userId) {
        const data = await db.getAsync(
            `SELECT 
                COALESCE(julianday('now') - julianday(created_at), 0) as days_active,
                COALESCE(direct_referrals, 0) as direct_referrals,
                COALESCE(referrals, 0) as referrals
            FROM users WHERE user_id = ?`,
            [userId]
        );
        
        return data ? 
            data.days_active * (data.direct_referrals * 0.5 + data.referrals * 0.2) :
            0;
    }
}

// Add analytics tracking middleware
bot.use((ctx, next) => {
    const analytics = new AnalyticsManager();
    
    // Track user activity for all messages
    if (ctx.message && ctx.chat.type !== 'private') {
        analytics.trackUserActivity(ctx);
        analytics.trackMessage(ctx);
    }

    // Track admin actions
    if (ctx.message && ctx.message.reply_to_message) {
        const isAdminAction = ['ban', 'warn', 'delete'].some(action => 
            ctx.message.text?.startsWith(`/${action}`)
        );
        
        if (isAdminAction) {
            analytics.trackAdminAction(
                ctx,
                ctx.message.text.split(' ')[0].slice(1),
                ctx.message.reply_to_message.from.id
            );
        }
    }
    
    return next();
});

bot.command('feedback', async (ctx) => {
    const message = ctx.message.text.split(' ').slice(1).join(' ');
    await db.runAsync(
        'INSERT INTO feedback (message, group_id) VALUES (?, ?)',
        [message, ctx.chat?.id || null]
    );
    ctx.reply('📩 Your feedback has been anonymously submitted!');
});

// New Analytics Commands
bot.command('groupstats', async (ctx) => {
    if (!ADMINS.has(ctx.from.id)) return;
    
    const analytics = new AnalyticsManager();
    const [dau, engagement] = await Promise.all([
        analytics.getGroupDAU(ctx.chat.id),
        analytics.getEngagementRate(ctx.chat.id)
    ]);

    const stats = await db.getAsync(
        `SELECT
            COUNT(DISTINCT user_id) as total_members,
            SUM(CASE WHEN message_type = 'photo' THEN 1 ELSE 0 END) as photos,
            SUM(CASE WHEN message_type = 'video' THEN 1 ELSE 0 END) as videos,
            SUM(CASE WHEN message_type = 'link' THEN 1 ELSE 0 END) as links
        FROM messages
        WHERE group_id = ?`,
        [ctx.chat.id]
    );

    const avgMessages = engagement.active_users > 0 
    ? (engagement.total_messages / engagement.active_users).toFixed(1) 
    : 0;

const msg = `📊 *Group Analytics*\n\n` +
    `👥 Daily Active: ${dau.dau}\n` +
    `💬 Avg Messages/User: ${avgMessages}\n` +
    `📷 Photos: ${stats.photos}\n` +
    `🎥 Videos: ${stats.videos}\n` +
    `🔗 Links Shared: ${stats.links}`;

ctx.replyWithMarkdown(msg);

});

bot.command('userstats', async (ctx) => {
    const analytics = new AnalyticsManager();
    const targetUserId = ctx.message.reply_to_message?.from.id || ctx.from.id;
    
    const [activity, ltv] = await Promise.all([
        db.getAsync(
            `SELECT 
                COUNT(DISTINCT activity_date) as active_days,
                SUM(message_count) as total_messages
            FROM user_activity 
            WHERE user_id = ?`,
            [targetUserId]
        ),
        analytics.calculateLTV(targetUserId)
    ]);

    const msg = `👤 *User Statistics*\n\n` +
        `📅 Active Days: ${activity.active_days}\n` +
        `💬 Total Messages: ${activity.total_messages}\n` +
        `💰 Estimated LTV: $${ltv.toFixed(2)}`;
    
    ctx.replyWithMarkdown(msg);
});

// Heatmap Generation (requires chart.js or external service)
bot.command('heatmap', async (ctx) => {
    const data = await db.allAsync(
        `SELECT 
            strftime('%H', timestamp) as hour,
            COUNT(*) as message_count
        FROM messages
        WHERE group_id = ?
        GROUP BY hour`,
        [ctx.chat.id]
    );

    const heatmap = Array(24).fill(0);
    data.forEach(row => heatmap[row.hour] = row.message_count);
    
    const visual = heatmap.map((count, hour) => 
        `${hour.toString().padStart(2, '0')}:00 - ${'█'.repeat(Math.min(count, 10))}`
    ).join('\n');

    ctx.replyWithMarkdown(`🕒 *Activity Heatmap*\n\n${visual}`);
});

// Verification middleware
bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        if (ctx.message && !ctx.message.text?.match(/^\/(verify|answer|start)/i)) {
            const isVerified = await db.getAsync(
                'SELECT 1 FROM verified_users WHERE user_id = ? AND verified_at IS NOT NULL',
                [ctx.from.id]
            );

            if (!isVerified) {
                try {
                    await ctx.deleteMessage();
                    await ctx.replyWithMarkdown(
                        `⚠️ ${escapeMd(ctx.from.first_name)}, you must complete verification!\n` +
                        `Use /verify to start the process`
                    );
                } catch (err) {
                    console.error('Verification middleware error:', err);
                }
                return;
            }
        }
    }
    await next();
});

// Improved Verification Command
bot.command('verify', async (ctx) => {
    try {
        const existing = await db.getAsync(
            'SELECT * FROM verified_users WHERE user_id = ?',
            [ctx.from.id]
        );

        if (existing?.verified_at) {
            return ctx.reply('✅ You are already verified!');
        }

        // Generate simple math CAPTCHA
        const num1 = Math.floor(Math.random() * 10);
        const num2 = Math.floor(Math.random() * 10);
        const answer = num1 + num2;

        await db.runAsync(
            `INSERT INTO verified_users 
            (user_id, verification_step, verification_data, attempts) 
            VALUES (?, 1, ?, 0)
            ON CONFLICT(user_id) DO UPDATE SET
            verification_step = 1,
            verification_data = excluded.verification_data,
            attempts = 0`,
            [ctx.from.id, JSON.stringify({ num1, num2, answer })]
        );

        const msg = await ctx.replyWithMarkdown(
            `🔒 *Verification Required*\n\n` +
            `To prevent spam, please solve this:\n\n` +
            `*${num1} + ${num2} = ?*\n\n` +
            `_Reply with:_ \`/answer [number]\``
        );

        setTimeout(() => {
            ctx.deleteMessage(msg.message_id).catch((err) => console.error('❌ Failed to delete message:', err));
        }, 60000); // Delete after 1 minute
    } catch (err) {
        console.error('❌ Verify command error:', err);
        ctx.reply('⚠️ An error occurred. Please try again.');
    }
});

// Enhanced Answer Handling
bot.command('answer', async (ctx) => {
    try {
        const input = ctx.message.text.split(' ')[1];
        if (!input || isNaN(input)) {
            return ctx.reply('⚠️ Please provide a valid number. Example: `/answer 12`');
        }

        const answer = parseInt(input);
        const record = await db.getAsync(
            'SELECT * FROM verified_users WHERE user_id = ?',
            [ctx.from.id]
        );

        if (!record || record.verification_step !== 1) {
            return ctx.reply('❌ Start verification first with /verify');
        }

        if (record.attempts >= 3) {
            return ctx.reply('❌ Too many failed attempts. Please wait 10 minutes and try again.');
        }

        const data = JSON.parse(record.verification_data);

        if (answer === data.answer) {
            await db.runAsync(
                `UPDATE verified_users SET 
                verified_at = CURRENT_TIMESTAMP,
                verification_step = 2
                WHERE user_id = ?`,
                [ctx.from.id]
            );
            ctx.reply('✅ Verification successful! You can now participate.');
        } else {
            await db.runAsync(
                'UPDATE verified_users SET attempts = attempts + 1 WHERE user_id = ?',
                [ctx.from.id]
            );
            const remainingAttempts = 2 - record.attempts; // Adjust calculation
            ctx.reply(`❌ Incorrect answer. Attempts left: ${remainingAttempts}`);
        }
    } catch (err) {
        console.error('❌ Answer command error:', err);
        ctx.reply('⚠️ An error occurred. Please try again.');
    }
});

const reportScheduler = setInterval(async () => {
    const groups = await db.allAsync('SELECT group_id FROM groups');
    
    groups.forEach(async (group) => {
        const report = await generateDailyReport(group.group_id);
        ctx.telegram.sendMessage(
            group.group_id, 
            report, 
            { parse_mode: 'Markdown' }
        );
    });
}, 24 * 60 * 60 * 1000); // Daily

async function generateDailyReport(groupId) {
    const data = await db.getAsync(
        `SELECT 
            COUNT(*) as messages,
            COUNT(DISTINCT user_id) as active_users,
            SUM(CASE WHEN is_forwarded THEN 1 ELSE 0 END) as forwards
        FROM messages
        WHERE group_id = ? AND DATE(timestamp) = DATE('now', '-1 day')`,
        [groupId]
    );
    
    return `📊 *Daily Report*\n\n` +
           `💬 Messages: ${data.messages}\n` +
           `👥 Active Users: ${data.active_users}\n` +
           `📤 Forwards: ${data.forwards}`;
}

// Middlewares
bot.use(async (ctx, next) => {
    try {
        if (ctx.from) {
            await manager.createUser({
                id: ctx.from.id,
                username: ctx.from.username,
                is_bot: ctx.from.is_bot || false
            });
            
            // Cooldown check
            if (ctx.chat?.type === 'private') {
                const now = Date.now();
                const last = cooldowns.get(ctx.from.id) || 0;
                if (now - last < COOLDOWN) {
                    await ctx.reply('⏳ Please wait before sending another command');
                    return;
                }
                cooldowns.set(ctx.from.id, now);
            }
        }
        await next();
    } catch (err) {
        console.error('Middleware Error:', err);
    }
});

// Help Command
bot.command('help', (ctx) => {
    const helpMessage = `
🤖 *Bot Help Guide*

🔐 *Security & Moderation:*
/feedback [message] - Submit anonymous feedback
/verify - Complete account verification
/mute [time] [reason] - Mute user (admin)
/unmute - Remove mute (admin)
/warn [reason] - Warn user (admin)

📈 *Analytics Commands:*
/groupstats - Group engagement dashboard
/userstats [@username] - User activity insights
/heatmap - Visual activity patterns
/report - Generate daily summary (admin)

🔗 *Referral System:*
/start - Get your referral link
/referrals - Your referral stats
/profile - Complete profile overview
/top - Leaderboard

👥 *Group Management:*
/addgroup - Register group (admin)
/groupinfo - Group statistics
/peakalerts - Toggle activity alerts (admin)

🛠️ *Admin Controls:*
/stats - System statistics
/broadcast - Broadcast message
/automod - Configure auto-moderation

👑 *Owner Controls:*
/addowner [user_id] - Add bot owner
/removeowner [user_id] - Remove bot owner

⚙️ *Auto Features:*
✅ Anonymous Feedback System
✅ Auto-Warn & Temp Mutes/Bans
✅ User Verification Gate
✅ Daily Engagement Reports
✅ Peak Activity Alerts
✅ Spam Protection
✅ Auto Message Cleanup
    `;
    ctx.replyWithMarkdown(helpMessage);
});

// Start Command
bot.start(async (ctx) => {
    try {
        const [_, refCode] = ctx.message.text.split(' ');
        const user = ctx.from;
        let referrerId = null;

        // Handle referrals
        if (refCode) {
            const referrer = await manager.getUser(refCode);
            if (referrer && referrer.user_id !== user.id) {
                referrerId = referrer.user_id;
                await manager.addReferral(referrerId, user.id);
            }
        }

        // Create/update user
        await manager.createUser({
            id: user.id,
            username: user.username,
            is_bot: user.is_bot || false
        }, referrerId);

        // Generate referral link
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
        const msg = await ctx.replyWithMarkdown(
            `🎉 Welcome *${escapeMd(user.first_name)}*\n\n` +
            `🔗 Your referral link:\n\`${refLink}\`\n\n` +
            `📊 Track invites with /referrals\n` +
            `🏆 Leaderboard: /top`
        );
        deleteMessage(ctx, msg.message_id, 15000);
    } catch (err) {
        console.error('Start Error:', err);
        ctx.reply('❌ Error processing request');
    }
});

// Referrals Command
bot.command('referrals', async (ctx) => {
    try {
        const stats = await db.getAsync(
            `SELECT u.direct_referrals, u.referrals,
            (SELECT COUNT(*) FROM referrals WHERE referrer_id = ?) AS total,
            (SELECT COUNT(*) FROM users WHERE referred_by = ?) AS network
            FROM users u WHERE u.user_id = ?`,
            [ctx.from.id, ctx.from.id, ctx.from.id]
        );

        const msg = await ctx.replyWithMarkdown(
            `📊 *Your Stats*\n` +
            `👥 Direct: ${stats.direct_referrals}\n` +
            `🌐 Network: ${stats.referrals}\n` +
            `🏆 Total: ${stats.total}\n` +
            `📈 Network Size: ${stats.network}`
        );
        deleteMessage(ctx, msg.message_id, 10000);
    } catch (err) {
        console.error('Referrals Error:', err);
    }
});

// Profile Command
bot.command('profile', async (ctx) => {
    try {
        const user = await manager.getUser(ctx.from.id);
        if (!user) return ctx.reply('❌ Use /start first');

        const refLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
        ctx.replyWithMarkdown(
            `👤 *Profile*\n\n` +
            `🆔 ID: ${user.user_id}\n` +
            `📅 Joined: ${new Date(user.created_at).toLocaleDateString()}\n\n` +
            `📊 Referrals: ${user.direct_referrals} direct / ${user.referrals} total\n\n` +
            `🔗 Your link:\n\`${refLink}\``
        );
    } catch (err) {
        console.error('Profile Error:', err);
        ctx.reply('❌ Error fetching profile data.');
    }
});


// Top Command
bot.command('top', async (ctx) => {
    try {
        const topUsers = await db.allAsync(
            `SELECT username, direct_referrals 
            FROM users 
            ORDER BY direct_referrals DESC 
            LIMIT 10`
        );

        const leaders = topUsers.map((u, i) => 
            `${i+1}. ${u.username || 'Anonymous'} - ${u.direct_referrals}`
        ).join('\n');

        const msg = await ctx.replyWithMarkdown(
            `🏆 *Top Referrers*\n\n${leaders || 'No data yet'}`
        );
        deleteMessage(ctx, msg.message_id, 15000);
    } catch (err) {
        console.error('Top Error:', err);
    }
});

// Group Management
bot.command("addgroup", async (ctx) => {
    try {
        if (!["group", "supergroup"].includes(ctx.chat.type)) {
            return ctx.reply("❌ This command only works in groups.");
        }

        // Get group admin list
        const chatAdmins = await ctx.getChatAdministrators();
        const isAdmin = chatAdmins.some((admin) => admin.user.id === ctx.from.id);

        if (!isAdmin) {
            return ctx.reply("🚫 Only group admins can use this command.");
        }

        const groupId = ctx.chat.id;
        const groupName = ctx.chat.title;

        // Store the group in the database
        await db.runAsync(
            `INSERT INTO groups (group_id, group_name) VALUES (?, ?) ON CONFLICT(group_id) DO UPDATE SET group_name = excluded.group_name`,
            [groupId, groupName]
        );

        ctx.reply(`✅ Group "${groupName}" has been added by an admin!`);
    } catch (err) {
        console.error("Error in /addgroup:", err);
        ctx.reply("❌ Failed to add group. Try again.");
    }
});

// Group Info Command
bot.command('groupinfo', async (ctx) => {
    try {
        if (!['group', 'supergroup'].includes(ctx.chat.type)) return;

        const group = await db.getAsync(
            `SELECT g.*, 
            (SELECT COUNT(*) FROM referrals WHERE group_id = ?) AS referrals
            FROM groups g WHERE group_id = ?`,
            [ctx.chat.id, ctx.chat.id]
        );

        if (!group) return ctx.reply('❌ Group not registered');

        const msg = await ctx.replyWithMarkdown(
            `👥 *Group Info*\n\n` +
            `🏷️ Name: ${escapeMd(group.group_name)}\n` +
            `📅 Created: ${new Date(group.created_at).toLocaleDateString()}\n` +
            `📊 Referrals: ${group.referrals}\n` +
            `🔗 Referral Code: \`${group.referral_code}\``
        );
        deleteMessage(ctx, msg.message_id, 15000);
    } catch (err) {
        console.error('GroupInfo Error:', err);
    }
});

// Admin Commands
bot.command('stats', async (ctx) => {
    try {
        if (!ADMINS.has(ctx.from.id)) return;

        const stats = await db.getAsync(
            `SELECT 
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM groups) AS groups,
                (SELECT SUM(direct_referrals) FROM users) AS direct_refs,
                (SELECT COUNT(*) FROM referrals) AS total_refs`
        );

        const msg = await ctx.replyWithMarkdown(
            `📈 *System Stats*\n\n` +
            `👤 Users: ${stats.users}\n` +
            `👥 Groups: ${stats.groups}\n` +
            `📨 Direct Referrals: ${stats.direct_refs}\n` +
            `🌐 Total Referrals: ${stats.total_refs}`
        );
        deleteMessage(ctx, msg.message_id, 15000);
    } catch (err) {
        console.error('Stats Error:', err);
    }
});

bot.command('broadcast', async (ctx) => {
    try {
        if (!ADMINS.has(ctx.from.id)) return;
        
        const message = ctx.message.text.slice('/broadcast'.length).trim();
        if (!message) return ctx.reply('❌ Please provide a message to broadcast');

        const users = await db.allAsync(
            'SELECT user_id FROM users WHERE is_bot = 0'
        );

        let success = 0, failed = 0;
        for (const user of users) {
            try {
                await ctx.telegram.sendMessage(user.user_id, message);
                success++;
            } catch (err) {
                failed++;
                console.error(`Broadcast failed to ${user.user_id}:`, err.message);
            }
        }
        
        ctx.reply(
            `📢 Broadcast results:\n` +
            `✅ Success: ${success}\n` +
            `❌ Failed: ${failed}`
        );
    } catch (err) {
        console.error('Broadcast Error:', err);
    }
});

async function broadcastMessage(ctx, message) {
    const users = await db.allAsync('SELECT user_id FROM users WHERE is_bot = 0');
    let success = 0, failed = 0;

    for (const user of users) {
        try {
            await ctx.telegram.sendMessage(user.user_id, message);
            success++;
            await new Promise(res => setTimeout(res, 1000)); // 1-second delay
        } catch (err) {
            failed++;
            console.error(`Broadcast failed to ${user.user_id}:`, err.message);
        }
    }

    ctx.reply(`📢 Broadcast results:\n✅ Success: ${success}\n❌ Failed: ${failed}`);
}


// Auto Welcome Messages
bot.on('new_chat_members', async (ctx) => {
    try {
        const group = await db.getAsync(
            'SELECT * FROM groups WHERE group_id = ?',
            [ctx.chat.id]
        );

        if (group) {
            for (const member of ctx.message.new_chat_members) {
                // Skip bots
                if (member.is_bot) continue;

                // Update user as non-bot
                await db.runAsync(
                    `INSERT INTO users (user_id, username, is_bot)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                    username = excluded.username`,
                    [member.id, member.username, 0]
                );

                // Check for existing referral
                const referral = await db.getAsync(
                    `SELECT referrer_id FROM referrals
                    WHERE referee_id = ? AND group_id = ?`,
                    [member.id, ctx.chat.id]
                );

                if (!referral) {
                    const msg = await ctx.replyWithMarkdown(
                        `🎉 Welcome ${escapeMd(member.first_name)}!\n` +
                        `🔗 Invite others using: \`${group.referral_code}\``
                    );
                    deleteMessage(ctx, msg.message_id, 15000);
                }
            }
        }
    } catch (err) {
        console.error('Welcome Message Error:', err);
    }
});

bot.command('mute', async (ctx) => {
    try {
        // Ensure the bot has admin privileges
        if (!(await checkBotAdmin(ctx))) {
            return ctx.reply("❌ I need admin privileges to mute users.");
        }

        // Check if user is bot owner or group admin
        const isOwner = BOT_OWNERS.has(ctx.from.id);
        const isGroupAdmin = await checkAdmin(ctx);
        if (!isOwner && !isGroupAdmin) {
            return ctx.reply("❌ You don't have permission to mute users.");
        }

        // Ensure the command is a reply to a user’s message
        const repliedUser = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : null;
        if (!repliedUser) {
            return ctx.reply("❌ Please reply to a user's message to mute them.");
        }

        const userId = repliedUser.id;
        const groupId = ctx.chat.id;

        // Parse mute duration (default: 10 minutes)
        const duration = ctx.message.text.split(" ")[1] || "10m";
        const reason = ctx.message.text.split(" ").slice(2).join(" ") || "No reason provided";

        const expires = new Date(Date.now() + ms(duration));

        // Store mute info in DB
        await db.runAsync(
            `INSERT INTO temp_bans (user_id, group_id, reason, expires)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, group_id) DO UPDATE SET expires = ?`,
            [userId, groupId, reason, expires, expires]
        );

        // Apply mute using Telegram API
        await ctx.telegram.restrictChatMember(groupId, userId, {
            until_date: Math.floor(expires.getTime() / 1000),
            permissions: {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false
            }
        });

        ctx.reply(`🔇 [${repliedUser.username}](tg://user?id=${userId}) has been muted for ${duration}. Reason: ${reason}`, {
            parse_mode: "Markdown"
        });

    } catch (error) {
        console.error("Mute error:", error);
        ctx.reply("❌ Error muting user.");
    }
});

bot.command('unmute', async (ctx) => {
    try {
        // Ensure the bot has admin privileges
        if (!(await checkBotAdmin(ctx))) {
            return ctx.reply("❌ I need admin privileges to unmute users.");
        }

        // Check if user is bot owner or group admin
        const isOwner = BOT_OWNERS.has(ctx.from.id);
        const isGroupAdmin = await checkAdmin(ctx);
        if (!isOwner && !isGroupAdmin) {
            return ctx.reply("❌ You don't have permission to unmute users.");
        }

        // Ensure the command is a reply to a user’s message
        const repliedUser = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : null;
        if (!repliedUser) {
            return ctx.reply("❌ Please reply to a user's message to unmute them.");
        }

        const userId = repliedUser.id;
        const groupId = ctx.chat.id;

        // Remove mute record from DB
        await db.runAsync(`DELETE FROM temp_bans WHERE user_id = ? AND group_id = ?`, [userId, groupId]);

        // Lift mute restrictions
        await ctx.telegram.restrictChatMember(groupId, userId, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true
            }
        });

        ctx.reply(`✅ [${repliedUser.username}](tg://user?id=${userId}) has been unmuted.`, {
            parse_mode: "Markdown"
        });

    } catch (error) {
        console.error("Unmute error:", error);
        ctx.reply("❌ Error unmuting user.");
    }
});

// Function to check if user is an admin in the group
async function checkAdmin(ctx) {
    try {
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        return ["creator", "administrator"].includes(chatMember.status);
    } catch (error) {
        console.error("Admin check error:", error);
        return false;
    }
}

// Function to check if the bot itself is an admin
async function checkBotAdmin(ctx) {
    try {
        const botMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
        return ["administrator"].includes(botMember.status);
    } catch (error) {
        console.error("Bot admin check error:", error);
        return false;
    }
}

// Middleware for Auto-Moderation (Flood & Banned Words)
bot.use(async (ctx, next) => {
    try {
        if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
            // Flood detection
            if (await automod.checkMessageFlood(ctx)) return;

            // Banned words check
            const settings = await db.getAsync(
                'SELECT banned_words FROM group_settings WHERE group_id = ?',
                [ctx.chat.id]
            );

            if (settings?.banned_words) {
                const banned = settings.banned_words.split(',');
                if (banned.some(word => ctx.message.text?.toLowerCase().includes(word))) {
                    await ctx.deleteMessage();
                    return ctx.reply("⚠️ This message contains banned words.");
                }
            }
        }
        await next();
    } catch (error) {
        console.error("Auto-moderation error:", error);
    }
});

bot.use((ctx, next) => {
    if (!security.checkRateLimit(ctx.from.id, 'general')) {
        ctx.reply('⚠️ Too many requests. Please slow down.');
        return;
    }
    return next();
});

bot.command('automod', async (ctx) => {
    if (!ctx.isAdmin) return ctx.reply('❌ Only admins can use this command.');
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Toggle Flood Detection', 'toggle_flood')],
        [Markup.button.callback('Edit Banned Words', 'edit_banned_words')]
    ]);
    ctx.reply('⚙️ Auto-Moderation Settings:', keyboard);
});

// 📌 Handle Flood Detection Toggle
bot.action('toggle_flood', async (ctx) => {
    try {
        const groupId = ctx.chat.id;
        const isAdmin = await checkAdmin(ctx);

        if (!isAdmin) {
            return ctx.reply("❌ Only group admins can change moderation settings.");
        }

        const result = await db.getAsync(
            `SELECT automod_enabled FROM group_settings WHERE group_id = ?`,
            [groupId]
        );

        const newSetting = result && result.automod_enabled ? 0 : 1;

        await db.runAsync(
            `INSERT INTO group_settings (group_id, automod_enabled)
            VALUES (?, ?) ON CONFLICT(group_id) DO UPDATE SET automod_enabled = ?`,
            [groupId, newSetting, newSetting]
        );

        const status = newSetting ? "✅ Enabled" : "❌ Disabled";
        
        // **Edit previous bot message instead of sending a new one**
        await ctx.editMessageText(`🔄 Flood Detection is now: *${status}*`, { parse_mode: "Markdown" });

    } catch (error) {
        console.error("Error toggling flood detection:", error);
        ctx.reply("❌ Failed to toggle flood detection.");
    }
});

// 📌 Handle Editing Banned Words
bot.action('edit_banned_words', async (ctx) => {
    try {
        const groupId = ctx.chat.id;
        const isAdmin = await checkAdmin(ctx);

        if (!isAdmin) {
            return ctx.reply("❌ Only group admins can edit banned words.");
        }

        await ctx.reply("📝 Send the new banned words list (comma-separated). Example: `spam, scam, fraud`", { parse_mode: "Markdown" });

        bot.on('text', async (messageCtx) => {
            const words = messageCtx.message.text.split(',').map(w => w.trim()).join(',');
            await db.runAsync(
                `INSERT INTO group_settings (group_id, banned_words)
                VALUES (?, ?) ON CONFLICT(group_id) DO UPDATE SET banned_words = ?`,
                [groupId, words, words]
            );
            
            // **Send confirmation message**
            messageCtx.reply(`✅ Updated banned words list:\n\`${words}\``, { parse_mode: "Markdown" });
        });

    } catch (error) {
        console.error("Error editing banned words:", error);
        ctx.reply("❌ Failed to update banned words.");
    }
});

// 📌 Check if the User is an Admin
async function checkAdmin(ctx) {
    const member = await ctx.getChatMember(ctx.from.id);
    return ['creator', 'administrator'].includes(member.status);
}

function validateDuration(duration) {
    const units = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000
    };
    
    const match = duration.match(/^(\d+)([smhd])$/);
    return match ? units[match[2]] * match[1] : null;
}

async function deleteMessage(ctx, msgId, delay = 15000) {
    setTimeout(async () => {
        try {
            await ctx.deleteMessage(msgId);
        } catch (err) {
            console.error('Delete message failed:', err);
        }
    }, delay);
}

const schedule = require('node-schedule');

schedule.scheduleJob('0 12 * * *', () => { // Every day at 12 PM
    bot.telegram.sendMessage(GROUP_ID, '📢 Reminder: Stay active and invite friends!');
});

bot.on('text', async (ctx, next) => {
    const settings = await db.getAsync('SELECT banned_words FROM group_settings WHERE group_id = ?', [ctx.chat.id]);

    if (settings?.banned_words) {
        const bannedWords = settings.banned_words.split(',');
        if (bannedWords.some(word => ctx.message.text.includes(word))) {
            await ctx.deleteMessage();
            return ctx.reply('⚠️ Please avoid using restricted words.');
        }
    }

    await next();
});

// Utilities
function escapeMd(text) {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function deleteMessage(ctx, msgId, delay = 15000) {
    setTimeout(() => ctx.deleteMessage(msgId).catch(() => {}), delay);
}

bot.catch((err, ctx) => {
    console.error(`Error in ${ctx.updateType}:`, err);
    ctx.reply('❌ An unexpected error occurred. Please try again.');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

bot.launch().then(() => console.log('🚀 Bot started successfully!'));
