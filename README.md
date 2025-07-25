# Telegram Terminal Bot

A secure Telegram bot that provides terminal access to a single authorized user. The bot emulates a terminal interface within Telegram, allowing you to execute shell commands remotely.

## Features

- **Single User Access**: Only one authorized user can use the bot
- **Real-time Terminal Emulation**: Full terminal session with persistent state
- **Multiple Input Formats**: Supports plain text, single backticks, and triple backticks
- **Live Output Updates**: Terminal output updates in real-time within the same message
- **Session Management**: Start, stop, and restart terminal sessions

## Setup

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Create Environment File**:
   ```bash
   cp .env.example .env
   ```

3. **Configure Environment Variables**:
   Edit `.env` file with your values:
   ```env
   BOT_TOKEN=your_bot_token_here
   AUTHORIZED_USER_ID=123456789
   TERMINAL_COLS=80
   TERMINAL_ROWS=24
   SHELL=/bin/bash
   ```

4. **Get Required Values**:
   - **BOT_TOKEN**: Create a bot with [@BotFather](https://t.me/BotFather) on Telegram
   - **AUTHORIZED_USER_ID**: Get your user ID from [@userinfobot](https://t.me/userinfobot)

5. **Run the Bot**:
   ```bash
   bun start
   ```

   For development with auto-reload:
   ```bash
   bun run dev
   ```

## Usage

### Commands

- `/start` - Start a new terminal session
- `/stop` - Stop the current terminal session
- `/restart` - Restart the terminal session

### Sending Commands

You can send terminal commands in three ways:

1. **Plain text**: `ls -la`
2. **Single backticks**: `\`ls -la\``
3. **Triple backticks**: 
   ```
   ```
   ls -la
   ```
   ```

### Example Session

1. Send `/start` to begin
2. Send `pwd` to see current directory
3. Send `ls` to list files
4. Send `cd /tmp && ls` to navigate and list
5. Send `/stop` when finished

## Security Notes

- Only the authorized user ID can interact with the bot
- All terminal commands run with the bot process permissions
- Be careful with commands that modify system files
- Consider running in a container for additional isolation

## Requirements

- Node.js 18+ or Bun
- Linux/macOS (Windows support via WSL)
- Telegram Bot Token
- User ID for authorization
