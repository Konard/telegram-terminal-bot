import { Bot, InlineKeyboard } from "grammy";
import * as pty from "node-pty";
import { config } from "dotenv";
import pino from "pino";
import { createWriteStream } from "fs";

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

if (!AUTHORIZED_USER_ID && !process.env.AUTHORIZED_USERNAME) {
  logger.fatal('Either AUTHORIZED_USER_ID or AUTHORIZED_USERNAME must be set');
  process.exit(1);
}

const bot = new Bot(process.env.BOT_TOKEN);
const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID ? parseInt(process.env.AUTHORIZED_USER_ID) : null;
const AUTHORIZED_USERNAME = process.env.AUTHORIZED_USERNAME;
const TERMINAL_COLS = parseInt(process.env.TERMINAL_COLS) || 80;
const TERMINAL_ROWS = parseInt(process.env.TERMINAL_ROWS) || 24;
const SHELL = process.env.SHELL || "/bin/bash";

logger.info({
  authorizedUserId: AUTHORIZED_USER_ID,
  authorizedUsername: AUTHORIZED_USERNAME,
  terminalCols: TERMINAL_COLS,
  terminalRows: TERMINAL_ROWS,
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

// Helper function to format terminal output
function formatTerminalOutput(output, cols = TERMINAL_COLS, rows = TERMINAL_ROWS) {
  const lines = output.split('\n');
  const displayLines = lines.slice(-rows).map(line => {
    if (line.length > cols) {
      return line.substring(0, cols);
    }
    return line.padEnd(cols);
  });
  
  // Ensure we have exactly 'rows' lines
  while (displayLines.length < rows) {
    displayLines.unshift(''.padEnd(cols));
  }
  
  return displayLines.join('\n');
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
  logger.info({ userId }, 'Starting terminal session');
  
  try {
    // Kill existing session if any
    if (userSessions.has(userId)) {
      logger.info({ userId }, 'Killing existing terminal session');
      userSessions.get(userId).terminal.kill();
      userSessions.delete(userId);
    }
    
    // Create new terminal session
    logger.debug({ shell: SHELL, cols: TERMINAL_COLS, rows: TERMINAL_ROWS }, 'Creating new terminal session');
    const terminal = pty.spawn(SHELL, [], {
      name: 'xterm-color',
      cols: TERMINAL_COLS,
      rows: TERMINAL_ROWS,
      cwd: process.env.HOME,
      env: process.env
    });
    
    let output = '';
    let messageId = null;
    
    // Handle terminal output
    terminal.onData((data) => {
      logger.debug({ userId, dataLength: data.length }, 'Terminal data received');
      output += data;
      updateTerminalMessage();
    });
    
    // Handle terminal exit
    terminal.onExit((exitCode, signal) => {
      logger.info({ userId, exitCode, signal }, 'Terminal session ended');
      userSessions.delete(userId);
      ctx.reply("🔴 Terminal session ended.");
    });
    
    // Function to update the terminal message
    async function updateTerminalMessage() {
      try {
        const formattedOutput = formatTerminalOutput(output);
        const messageText = `\`\`\`\n${formattedOutput}\n\`\`\``;
        
        logger.debug({ userId, messageId, outputLength: output.length }, 'Updating terminal message');
        
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat.id, messageId, messageText, {
            parse_mode: "Markdown"
          });
          logger.debug({ userId, messageId }, 'Terminal message updated');
        } else {
          const message = await ctx.reply(messageText, {
            parse_mode: "Markdown"
          });
          messageId = message.message_id;
          logger.debug({ userId, messageId }, 'Initial terminal message sent');
        }
      } catch (error) {
        logger.warn({ userId, error: error.message, errorCode: error.error_code }, 'Failed to update terminal message');
        
        // If editing fails (e.g., message too old), send a new message
        if (error.error_code === 400) {
          try {
            const formattedOutput = formatTerminalOutput(output);
            const messageText = `\`\`\`\n${formattedOutput}\n\`\`\``;
            const message = await ctx.reply(messageText, {
              parse_mode: "Markdown"
            });
            messageId = message.message_id;
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
      output,
      messageId,
      updateTerminalMessage
    });
    
    logger.info({ userId }, 'Terminal session created and stored');
    
    // Send initial welcome message
    await ctx.reply("🚀 Terminal session started! Send commands as messages.");
    logger.debug({ userId }, 'Welcome message sent');
    
    // Wait a bit for initial shell prompt, then update
    setTimeout(updateTerminalMessage, 500);
    
  } catch (error) {
    logger.error({ userId, error: error.message, stack: error.stack }, 'Failed to start terminal session');
    await ctx.reply("❌ Failed to start terminal session. Check logs for details.");
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
  
  try {
    logger.info({ userId, command }, 'Executing terminal command');
    // Send command to terminal
    session.terminal.write(command + '\r');
  } catch (error) {
    logger.error({ userId, command, error: error.message }, 'Failed to execute terminal command');
    await ctx.reply("❌ Failed to execute command. Check logs for details.");
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
  }
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
try {
  logger.info('Initializing bot...');
  await bot.start();
  logger.info('Telegram Terminal Bot started successfully!');
} catch (error) {
  logger.fatal({ error: error.message, stack: error.stack }, 'Failed to start bot');
  process.exit(1);
}