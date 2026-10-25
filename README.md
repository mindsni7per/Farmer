# Farmer Discord Utility Bot

A Node.js & Discord.js bot that handles account authorization (`,verify`) and server additions (`,join <Server ID>`) with automated restock logging and role-based limits.

## Features
- **OAuth2 Scope Verification**: Generates verification links using `.verify`.
- **Server Addition Command**: Adds verified accounts to target servers via `.join <server_id>`.
- **Role Limits**: Caps joins to 2 accounts for users holding role `-1561435531462844587`.
- **Dynamic Prefix Change**: Adjust the bot prefix using `.prefix <new_prefix>`.
- **AutoRestock Notifications**: Broadcasts stock updates to `LOG_CHANNEL_ID` whenever a new user verifies.

## Deployment Instructions

1. **Deploy to Railway**:
   - Create a new project on [Railway](https://railway.app/).
   - Select **Deploy from GitHub repo** and connect this repository.

2. **Set Environment Variables**:
   Configure the following variables in Railway:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `CLIENT_SECRET`
   - `REDIRECT_URI` (Matches your Railway web URL ending in `/auth/callback`)
   - `LOG_CHANNEL_ID` (Optional log channel ID for restock alerts)

3. **Discord Developer Portal Setup**:
   - In your app's **OAuth2** tab, add your Railway Redirect URI:
     `https://<your-railway-domain>.up.railway.app/auth/callback`
   - Under **Bot**, enable **Message Content Intent** and **Server Members Intent**.