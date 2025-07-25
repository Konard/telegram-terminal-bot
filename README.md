# Telegram Terminal Bot 🚀

A powerful Telegram bot that provides secure terminal access with two modes: **text-based** for efficiency and **visual** for rich terminal output with GIF animations.

## 🌟 Features

### Core Features
- **Single User Access**: Only one authorized user can use the bot
- **Real-time Terminal Emulation**: Full terminal session with persistent state
- **Multiple Input Formats**: Supports plain text, single backticks, and triple backticks
- **Session Management**: Start, stop, and restart terminal sessions
- **Control Sequences**: Send `^C`, `^D`, `^Z` for process control

### Text Bot (text-bot.js) - Optimized for Traffic
- **VirtualTerminal Engine**: Advanced ANSI escape sequence support
- **Traffic Optimization**: 60-80% reduction in Telegram API calls
- **Smart Change Detection**: Updates only when screen content changes
- **Multiple Aspect Ratios**: 1:1 (44x44), 16:9 (56x32), 9:16 (32x56)
- **Interactive Command Support**: Perfect for `top`, `htop`, `vim`, etc.
- **Subscription System**: Real-time change notifications

### Visual Bot (visual-bot.js) - Rich Visual Output
- **GIF Animations**: 3-second animations for interactive commands
- **PNG Screenshots**: Static images for regular commands
- **ANSI Color Support**: Full terminal color rendering
- **Mobile Optimized**: Images sized perfectly for Telegram

## 📦 Setup

1. **Install Dependencies**:
   ```bash
   npm install
   # or
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
   # Use either USER_ID or USERNAME (not both)
   AUTHORIZED_USER_ID=123456789
   # AUTHORIZED_USERNAME=@yourusername
   SHELL=/bin/bash
   ```

4. **Get Required Values**:
   - **BOT_TOKEN**: Create a bot with [@BotFather](https://t.me/BotFather) on Telegram
   - **Authorization**: Choose one method:
     - **AUTHORIZED_USER_ID**: Get your user ID from [@userinfobot](https://t.me/userinfobot)
     - **AUTHORIZED_USERNAME**: Use your Telegram username (include @ symbol)

## 🚀 Usage

### Running the Bots

**Text Bot** (Low bandwidth, high efficiency):
```bash
node src/text-bot.js
```

**Visual Bot** (Rich visual output):
```bash
node src/visual-bot.js
```

### Commands

Both bots support:
- `/start` - Start terminal (text bot supports aspect ratios: `/start 16:9`)
- `/stop` - Stop the current terminal session
- `/restart` - Restart the terminal session
- `/help` - Show available commands and features

### Control Sequences

Send these as messages to control running processes:
- `^C` or `ctrl+c` - Send SIGINT (interrupt)
- `^D` or `ctrl+d` - Send EOF (end of file)
- `^Z` or `ctrl+z` - Send SIGTSTP (suspend)

### Sending Commands

You can send terminal commands in three ways:
1. **Plain text**: `ls -la`
2. **Single backticks**: `` `ls -la` ``
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
4. Send `top` to see processes (updates automatically!)
5. Send `^C` to stop the top command
6. Send `/stop` when finished

## 🧪 Testing

The project includes comprehensive test suites:

```bash
# Run all tests
npm test

# Individual test suites
node src/test-terminal.js          # Core VirtualTerminal tests
node src/test-subscription-system.js # Traffic optimization tests
node src/test-control-sequences.js  # Control sequence handling
node src/test-top-focused.js       # Interactive command tests
node src/test-bot-integration.js   # Bot integration tests
```

## 🏗️ Architecture

### VirtualTerminal System
The text bot uses a custom VirtualTerminal implementation that:
- Maintains a 2D character buffer with full ANSI support
- Implements cursor control, colors, and screen management
- Provides subscription-based change notifications
- Optimizes traffic by detecting actual screen changes

### Key Components
- **VirtualTerminal.js**: Core terminal emulator
- **text-bot.js**: Efficient text-based bot
- **visual-bot.js**: Rich visual bot with image generation
- **Comprehensive test suite**: 40+ tests ensuring reliability

## 🔒 Security Notes

- Only the authorized user can interact with the bot
- All terminal commands run with the bot process permissions
- Be careful with commands that modify system files
- Consider running in a container for additional isolation
- Bot tokens should never be committed to version control

## 📊 Performance

### Text Bot Performance
- **Processing Speed**: 1000+ lines per second
- **Traffic Reduction**: 60-80% fewer Telegram API calls
- **Memory Efficient**: Automatic buffer management
- **Real-time Updates**: Only when content changes

### Visual Bot Performance
- **GIF Generation**: 3-second animations at 10 FPS
- **Image Quality**: High-quality PNG/GIF output
- **ANSI Rendering**: Full color and style support

## 🛠️ Development

### Project Structure
```
src/
├── VirtualTerminal.js          # Core terminal emulator
├── text-bot.js                 # Text-based bot
├── visual-bot.js               # Visual bot with GIFs
├── test-*.js                   # Test suites
└── TEST_RESULTS_SUMMARY.md     # Test documentation
```

### Logging
Both bots use structured logging with pino:
- Logs are written to `logs/bot.log`
- Console output for development
- Debug mode available for troubleshooting

## 📋 Requirements

- Node.js 18+ or Bun
- Linux/macOS (Windows support via WSL)
- Telegram Bot Token
- User ID or username for authorization

## 🤝 Contributing

This is a single-user bot for personal use. Feel free to fork and modify for your needs!

## 📄 License

MIT License - See LICENSE file for details