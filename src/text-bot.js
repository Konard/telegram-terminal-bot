import { Bot, InlineKeyboard } from "grammy";
import * as pty from "node-pty";
import { config } from "dotenv";
import pino from "pino";
import { createWriteStream } from "fs";
import VirtualTerminal from "./VirtualTerminal.js";

config();

// Setup logger with file and console output
const logger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
}, pino.multistream([
  { stream: process.stdout },
  { stream: createWriteStream('./logs/bot.log', { flags: 'a' }) }
]));

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
});

logger.info('Starting Telegram Terminal Bot...');

// Validate required environment variables
if (!process.env.BOT_TOKEN) {
  logger.fatal('BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!process.env.AUTHORIZED_USER_ID && !process.env.AUTHORIZED_USERNAME) {
  logger.fatal('Either AUTHORIZED_USER_ID or AUTHORIZED_USERNAME must be set');
  process.exit(1);
}

const bot = new Bot(process.env.BOT_TOKEN);
const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID ? parseInt(process.env.AUTHORIZED_USER_ID) : null;
const AUTHORIZED_USERNAME = process.env.AUTHORIZED_USERNAME;
const SHELL = process.env.SHELL || "/bin/bash";

// Aspect ratio presets optimized for 2000 char Telegram limit
const ASPECT_RATIOS = {
  '1:1': { cols: 44, rows: 44, name: '1:1 Square' },
  '16:9': { cols: 56, rows: 32, name: '16:9 Landscape' },
  '9:16': { cols: 32, rows: 56, name: '9:16 Portrait' }
};

logger.info({
  authorizedUserId: AUTHORIZED_USER_ID,
  authorizedUsername: AUTHORIZED_USERNAME,
  aspectRatios: ASPECT_RATIOS,
  shell: SHELL
}, 'Bot configuration loaded');

// Store terminal sessions per user (though we only allow one user)
const userSessions = new Map();

// Helper function to check if user is authorized
function isAuthorized(user) {
  logger.debug({ userId: user.id, username: user.username }, 'Checking user authorization');
  
  if (AUTHORIZED_USER_ID && user.id === AUTHORIZED_USER_ID) {
    logger.debug({ userId: user.id }, 'User authorized by ID');
    return true;
  }
  
  if (AUTHORIZED_USERNAME && user.username) {
    const username = AUTHORIZED_USERNAME.startsWith('@') 
      ? AUTHORIZED_USERNAME.substring(1) 
      : AUTHORIZED_USERNAME;
    const isAuth = user.username === username;
    logger.debug({ username: user.username, expectedUsername: username, authorized: isAuth }, 'User authorization by username');
    return isAuth;
  }
  
  logger.warn({ userId: user.id, username: user.username }, 'User not authorized');
  return false;
}

// Middleware to check if user is authorized
bot.use((ctx, next) => {
  logger.debug({ 
    userId: ctx.from?.id, 
    username: ctx.from?.username,
    messageType: ctx.message?.text ? 'text' : ctx.update_type 
  }, 'Processing message');
  
  if (!isAuthorized(ctx.from)) {
    logger.warn({ userId: ctx.from?.id, username: ctx.from?.username }, 'Unauthorized access attempt');
    return ctx.reply("❌ You are not authorized to use this bot.");
  }
  return next();
});

// Helper function to escape markdown special characters
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Helper function to format terminal output using VirtualTerminal
function formatTerminalOutput(virtualTerminal) {
  return virtualTerminal.getScreenText();
}

// Helper function to parse command input (handle plain text, single quotes, triple quotes)
function parseCommandInput(text) {
  logger.debug({ originalText: text }, 'Parsing command input');
  
  // Remove triple backticks if present
  if (text.startsWith('```') && text.endsWith('```')) {
    const parsed = text.slice(3, -3).trim();
    logger.debug({ parsed, method: 'triple-backticks' }, 'Command parsed');
    return parsed;
  }
  
  // Remove single backticks if present
  if (text.startsWith('`') && text.endsWith('`')) {
    const parsed = text.slice(1, -1);
    logger.debug({ parsed, method: 'single-backticks' }, 'Command parsed');
    return parsed;
  }
  
  // Return plain text
  const parsed = text.trim();
  logger.debug({ parsed, method: 'plain-text' }, 'Command parsed');
  return parsed;
}

// Start command handler
bot.command("start", async (ctx) => {
  const userId = ctx.from.id;
  const aspectRatio = ctx.match || '16:9';
  
  logger.info({ userId, aspectRatio }, 'Starting terminal session');
  
  // Validate aspect ratio
  if (!ASPECT_RATIOS[aspectRatio]) {
    await ctx.reply(`❌ Invalid aspect ratio. Available options:\n\n📱 **Choose terminal aspect ratio:**\n• \`/start 1:1\` - ${ASPECT_RATIOS['1:1'].name} (${ASPECT_RATIOS['1:1'].cols}x${ASPECT_RATIOS['1:1'].rows})\n• \`/start 16:9\` - ${ASPECT_RATIOS['16:9'].name} (${ASPECT_RATIOS['16:9'].cols}x${ASPECT_RATIOS['16:9'].rows})\n• \`/start 9:16\` - ${ASPECT_RATIOS['9:16'].name} (${ASPECT_RATIOS['9:16'].cols}x${ASPECT_RATIOS['9:16'].rows})\n\n💡 Default: \`/start\` uses 16:9`, { parse_mode: 'Markdown' });
    return;
  }
  
  const { cols, rows, name } = ASPECT_RATIOS[aspectRatio];
  
  try {
    // Kill existing session if any
    if (userSessions.has(userId)) {
      logger.info({ userId }, 'Killing existing terminal session');
      userSessions.get(userId).terminal.kill();
      userSessions.delete(userId);
    }
    
    // Create new terminal session
    logger.debug({ shell: SHELL, cols, rows, aspectRatio: name }, 'Creating new terminal session');
    const terminal = pty.spawn(SHELL, [], {
      name: 'xterm-color',
      cols: cols,
      rows: rows,
      cwd: process.env.HOME,
      env: process.env
    });
    
    // Create virtual terminal for proper ANSI handling
    const virtualTerminal = new VirtualTerminal(cols, rows);
    let messageId = null;
    let updateTimeout = null;
    let lastMessageContent = '';
    
    // Subscribe to terminal changes for optimized updates
    const unsubscribeFromChanges = virtualTerminal.onScreenChange((changeData) => {
      logger.debug({
        userId,
        frameNumber: changeData.frameNumber,
        timestamp: changeData.timestamp,
        cursorPosition: changeData.cursorPosition
      }, 'Terminal screen changed');
      
      // Debounce updates to prevent rapid firing
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      const session = userSessions.get(userId);
      const debounceTime = session?.isInteractive ? 300 : 150;
      
      updateTimeout = setTimeout(() => {
        updateTerminalMessage();
      }, debounceTime);
    });
    
    // Handle terminal output
    terminal.onData((data) => {
      logger.debug({ 
        userId, 
        dataLength: data.length,
        dataPreview: data.substring(0, 50) + (data.length > 50 ? '...' : '')
      }, 'Terminal data received');
      
      // Feed data to virtual terminal for proper ANSI processing
      // The change subscription will handle updates automatically
      virtualTerminal.write(data);
    });
    
    // Handle terminal exit
    terminal.onExit((exitCode, signal) => {
      logger.info({ userId, exitCode, signal }, 'Terminal session ended');
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      // Unsubscribe from changes
      unsubscribeFromChanges();
      userSessions.delete(userId);
      ctx.reply("🔴 Terminal session ended.");
    });
    
    // Function to update the terminal message
    async function updateTerminalMessage() {
      try {
        const formattedOutput = formatTerminalOutput(virtualTerminal);
        const messageText = `🚀 **Terminal ${name} (${cols}x${rows})** - Ready!

📱 **Aspect ratios:** \`/start 1:1\` \`/start 16:9\` \`/start 9:16\`
💬 Send commands as text messages

\`\`\`
${formattedOutput}
\`\`\``;
        
        // Skip update if content hasn't changed (extra safety check)
        if (messageText === lastMessageContent) {
          logger.debug({ userId }, 'Skipping update - content unchanged (should not happen with subscription)');
          return;
        }
        
        // Mark terminal as read to reset change flag
        virtualTerminal.markAsRead();
        
        logger.debug({ 
          userId, 
          messageId, 
          screenCols: virtualTerminal.cols, 
          messageLength: messageText.length,
          cursorPos: virtualTerminal.getCursorPosition(),
          frameCounter: virtualTerminal.frameCounter,
          formattedPreview: formattedOutput.substring(0, 100) + (formattedOutput.length > 100 ? '...' : '')
        }, 'Updating terminal message');
        
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat.id, messageId, messageText, {
            parse_mode: "Markdown"
          });
          logger.debug({ userId, messageId }, 'Terminal message updated successfully');
          lastMessageContent = messageText;
          // Update session with current messageId
          if (userSessions.has(userId)) {
            userSessions.get(userId).messageId = messageId;
          }
        } else {
          const message = await ctx.reply(messageText, {
            parse_mode: "Markdown"
          });
          messageId = message.message_id;
          logger.debug({ userId, messageId }, 'New terminal message sent');
          lastMessageContent = messageText;
          // Update session with new messageId
          if (userSessions.has(userId)) {
            userSessions.get(userId).messageId = messageId;
          }
        }
      } catch (error) {
        // Check if it's just a "message not modified" error
        if (error.error_code === 400 && error.message.includes('message is not modified')) {
          logger.debug({ userId }, 'Message content unchanged, skipping update');
          return;
        }
        
        logger.warn({ userId, error: error.message, errorCode: error.error_code }, 'Failed to update terminal message');
        
        // Only create new message for other 400 errors (like message too old)
        if (error.error_code === 400 && !error.message.includes('message is not modified')) {
          try {
            const formattedOutput = formatTerminalOutput(virtualTerminal);
            const messageText = `🚀 **Terminal ${name} (${cols}x${rows})** - Ready!

📱 **Aspect ratios:** \`/start 1:1\` \`/start 16:9\` \`/start 9:16\`
💬 Send commands as text messages

\`\`\`
${formattedOutput}
\`\`\``;
            const message = await ctx.reply(messageText, {
              parse_mode: "Markdown"
            });
            messageId = message.message_id;
            lastMessageContent = messageText;
            // Update session with new messageId
            if (userSessions.has(userId)) {
              userSessions.get(userId).messageId = messageId;
            }
            logger.debug({ userId, messageId }, 'New terminal message sent after edit failure');
          } catch (e) {
            logger.error({ userId, error: e.message }, 'Failed to send new terminal message');
          }
        }
      }
    }
    
    // Store session
    userSessions.set(userId, {
      terminal,
      virtualTerminal,
      messageId,
      updateTerminalMessage,
      unsubscribeFromChanges,
      cols,
      rows,
      lastCommand: null,
      isInteractive: false
    });
    
    logger.info({ userId, aspectRatio: name, dimensions: `${cols}x${rows}` }, 'Terminal session created and stored');
    
    // Send initial terminal message with empty state
    const initialOutput = formatTerminalOutput(virtualTerminal);
    const initialMessage = `🚀 **Terminal ${name} (${cols}x${rows})** - Ready!

📱 **Aspect ratios:** \`/start 1:1\` \`/start 16:9\` \`/start 9:16\`
💬 Send commands as text messages

\`\`\`
${initialOutput}
\`\`\``;
    
    const message = await ctx.reply(initialMessage, { parse_mode: "Markdown" });
    messageId = message.message_id;
    lastMessageContent = initialMessage;
    
    // Update session with message ID
    if (userSessions.has(userId)) {
      userSessions.get(userId).messageId = messageId;
    }
    
    logger.debug({ userId, messageId }, 'Initial terminal message sent');
    
    // Wait a bit for initial shell prompt, then update
    setTimeout(updateTerminalMessage, 500);
    
  } catch (error) {
    logger.error({ userId, error: error.message, stack: error.stack }, 'Failed to start terminal session');
    await ctx.reply("❌ Failed to start terminal session. Check logs for details.");
    process.exit(1);
  }
});

// Handle all text messages as terminal commands
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  
  logger.debug({ userId, messageText: ctx.message.text }, 'Received text message');
  
  if (!session) {
    logger.warn({ userId }, 'No active terminal session for command execution');
    return ctx.reply("❌ No active terminal session. Use /start to begin.");
  }
  
  const command = parseCommandInput(ctx.message.text);

  // Skip if the message is empty after parsing
  if (!command) {
    logger.debug({ userId }, 'Empty command after parsing, skipping');
    return;
  }

  // Check for special control sequences
  if (command === '^C' || command === 'ctrl+c' || command === 'CTRL+C') {
    logger.info({ userId }, 'Sending SIGINT (Ctrl+C) to terminal');
    session.terminal.write('\x03'); // Send CTRL+C (ASCII 3)
    await ctx.reply(`🛑 Sent SIGINT (Ctrl+C) to terminal`, { parse_mode: 'Markdown' });
    return;
  } else if (command === '^D' || command === 'ctrl+d' || command === 'CTRL+D') {
    logger.info({ userId }, 'Sending EOF (Ctrl+D) to terminal');
    session.terminal.write('\x04'); // Send CTRL+D (ASCII 4)
    await ctx.reply(`🔚 Sent EOF (Ctrl+D) to terminal`, { parse_mode: 'Markdown' });
    return;
  } else if (command === '^Z' || command === 'ctrl+z' || command === 'CTRL+Z') {
    logger.info({ userId }, 'Sending SIGTSTP (Ctrl+Z) to terminal');
    session.terminal.write('\x1A'); // Send CTRL+Z (ASCII 26)
    await ctx.reply(`⏸️ Sent SIGTSTP (Ctrl+Z) to terminal`, { parse_mode: 'Markdown' });
    return;
  }

  // Store last command globally and in session for output formatting
  global.lastCommand = command;
  session.lastCommand = command;

  try {
    // Enhanced interactive command detection
    const interactiveCommands = ['top', 'htop', 'vim', 'nano', 'emacs', 'less', 'more', 'man', 'watch'];
    const streamingCommands = ['tail -f', 'ping'];
    const longRunningCommands = ['wget', 'curl', 'rsync'];
    
    const isInteractive = interactiveCommands.some(cmd => command.toLowerCase().startsWith(cmd));
    const isStreaming = streamingCommands.some(cmd => command.toLowerCase().includes(cmd));
    const isLongRunning = longRunningCommands.some(cmd => command.toLowerCase().startsWith(cmd));
    
    session.isInteractive = isInteractive || isStreaming;
    
    if (isInteractive) {
      logger.info({ userId, command }, 'Interactive command detected');
      await ctx.reply(`⚡ Running interactive command \`${command}\`. The display will update automatically. Send \`^C\` to stop.`, { parse_mode: 'Markdown' });
    } else if (isStreaming) {
      logger.info({ userId, command }, 'Streaming command detected');
      await ctx.reply(`🔄 Running streaming command \`${command}\`. Send \`^C\` to stop.`, { parse_mode: 'Markdown' });
    } else if (isLongRunning) {
      logger.info({ userId, command }, 'Long-running command detected');
      await ctx.reply(`⏳ Running \`${command}\`... This may take a while.`, { parse_mode: 'Markdown' });
    }

    logger.info({ userId, command }, 'Executing terminal command');
    // Send command to terminal
    session.terminal.write(command + '\r');
  } catch (error) {
    logger.error({ userId, command, error: error.message }, 'Failed to execute terminal command');
    await ctx.reply("❌ Failed to execute command. Check logs for details.");
    process.exit(1);
  }
});

// Handle stop command
bot.command("stop", async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  
  logger.info({ userId }, 'Stop command received');
  
  if (session) {
    try {
      session.terminal.kill();
      userSessions.delete(userId);
      logger.info({ userId }, 'Terminal session stopped successfully');
      await ctx.reply("🛑 Terminal session stopped.");
    } catch (error) {
      logger.error({ userId, error: error.message }, 'Failed to stop terminal session');
      await ctx.reply("❌ Failed to stop terminal session. Check logs for details.");
      process.exit(1);
    }
  } else {
    logger.warn({ userId }, 'Stop command called but no active session');
    await ctx.reply("❌ No active terminal session.");
  }
});

// Handle restart command
bot.command("restart", async (ctx) => {
  const userId = ctx.from.id;
  logger.info({ userId }, 'Restart command received');
  
  try {
    await ctx.reply("🔄 Restarting terminal session...");
    // Trigger start command
    await bot.handleUpdate({
      update_id: Date.now(),
      message: {
        message_id: Date.now(),
        from: ctx.from,
        chat: ctx.chat,
        date: Date.now(),
        text: "/start"
      }
    });
    logger.info({ userId }, 'Terminal session restart initiated');
  } catch (error) {
    logger.error({ userId, error: error.message }, 'Failed to restart terminal session');
    await ctx.reply("❌ Failed to restart terminal session. Check logs for details.");
    process.exit(1);
  }
});

// Handle help command
bot.command("help", async (ctx) => {
  const helpMessage = `🤖 **Telegram Terminal Bot Help**

**Commands:**
• \`/start\` - Start terminal with default 16:9 aspect ratio
• \`/start 1:1\` - Start with square terminal (44x44)
• \`/start 16:9\` - Start with landscape terminal (56x32)
• \`/start 9:16\` - Start with portrait terminal (32x56)
• \`/stop\` - Stop current terminal session
• \`/restart\` - Restart terminal session
• \`/help\` - Show this help message

**Control Sequences:**
• Send \`^C\` or \`ctrl+c\` - Send SIGINT (interrupt)
• Send \`^D\` or \`ctrl+d\` - Send EOF (end of file)
• Send \`^Z\` or \`ctrl+z\` - Send SIGTSTP (suspend)

**Usage:**
1. Start a terminal session with \`/start\`
2. Send any command as a text message
3. Interactive commands (top, vim, etc.) will update automatically
4. Use control sequences to manage running processes

**Tips:**
• The terminal displays are optimized for mobile screens
• Traffic optimization reduces unnecessary updates
• Long-running commands show progress indicators`;

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  logger.info({ userId: ctx.from.id }, 'Help command sent');
});

// Error handling
bot.catch((err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Bot error occurred');
  process.exit(1);
});

// Graceful shutdown
process.once("SIGINT", () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  // Kill all terminal sessions
  for (const [userId, session] of userSessions) {
    logger.debug({ userId }, 'Killing terminal session during shutdown');
    try {
      session.terminal.kill();
    } catch (error) {
      logger.warn({ userId, error: error.message }, 'Error killing terminal session during shutdown');
    }
  }
  logger.info('All terminal sessions closed, exiting...');
  process.exit(0);
});

process.once("SIGTERM", () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  // Kill all terminal sessions
  for (const [userId, session] of userSessions) {
    logger.debug({ userId }, 'Killing terminal session during shutdown');
    try {
      session.terminal.kill();
    } catch (error) {
      logger.warn({ userId, error: error.message }, 'Error killing terminal session during shutdown');
    }
  }
  logger.info('All terminal sessions closed, exiting...');
  process.exit(0);
});

// Start the bot
logger.info('Initializing bot...');
bot.start({
  onStart: () => {
    logger.info('Telegram Terminal Bot started successfully!');
    logger.info({ 
      botInfo: bot.botInfo,
      pollingActive: true 
    }, 'Bot is now listening for messages');
  }
}).catch((error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Failed to start bot');
  process.exit(1);
});