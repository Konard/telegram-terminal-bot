import { Bot, InlineKeyboard } from "grammy";
import * as pty from "node-pty";
import { config } from "dotenv";
import pino from "pino";
import { createWriteStream } from "fs";
import GIFEncoder from "gifencoder";
import { createCanvas } from "canvas";
import { Readable } from "stream";

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

// Animation settings
const ANIMATION_DURATION = 3000; // 3 seconds
const FRAME_INTERVAL = 1000; // 1 second per frame
const FONT_SIZE = 16;
const LINE_HEIGHT = FONT_SIZE * 1.2;

logger.info({
  authorizedUserId: AUTHORIZED_USER_ID,
  authorizedUsername: AUTHORIZED_USERNAME,
  aspectRatios: ASPECT_RATIOS,
  shell: SHELL
}, 'Bot configuration loaded');

// Store terminal sessions per user
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

// Helper function to clean ANSI escape codes
function cleanAnsiCodes(text) {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, '')
    .replace(/\x1b\][0-9;]*;[^\x1b]*\x1b\\/g, '')
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\x1b[()][\w]/g, '')
    .replace(/\x1b[NO]/g, '')
    .replace(/\x1b[78]/g, '')
    .replace(/\x1b[HJK]/g, '')
    .replace(/\x1b[ABCD]/g, '')
    .replace(/\r/g, '')
    .replace(/\x07/g, '')
    .replace(/\x08/g, '')
    .replace(/\x0f/g, '')
    .replace(/\x0e/g, '');
}

// Helper function to format terminal output
function formatTerminalOutput(output, cols, rows) {
  const cleanOutput = cleanAnsiCodes(output || '');
  if (!cleanOutput || cleanOutput.trim().length === 0) {
    const emptyLines = Array(rows).fill(''.padEnd(cols));
    return emptyLines.join('\n');
  }

  const lines = cleanOutput.split('\n');
  const displayLines = lines.slice(-rows).map(line => {
    if (line.length > cols) {
      return line.substring(0, cols);
    }
    return line.padEnd(cols);
  });

  while (displayLines.length < rows) {
    displayLines.unshift(''.padEnd(cols));
  }

  return displayLines.join('\n');
}

// Helper function to parse command input
function parseCommandInput(text) {
  logger.debug({ originalText: text }, 'Parsing command input');
  
  if (text.startsWith('```') && text.endsWith('```')) {
    const parsed = text.slice(3, -3).trim();
    logger.debug({ parsed, method: 'triple-backticks' }, 'Command parsed');
    return parsed;
  }
  
  if (text.startsWith('`') && text.endsWith('`')) {
    const parsed = text.slice(1, -1);
    logger.debug({ parsed, method: 'single-backticks' }, 'Command parsed');
    return parsed;
  }
  
  const parsed = text.trim();
  logger.debug({ parsed, method: 'plain-text' }, 'Command parsed');
  return parsed;
}

// Function to generate animated GIF from terminal frames
async function generateTerminalAnimation(frames, cols, rows) {
  const width = cols * (FONT_SIZE * 0.6); // Approximate character width
  const height = rows * LINE_HEIGHT;
  const encoder = new GIFEncoder(width, height);
  
  const stream = encoder.createReadStream();
  encoder.start();
  encoder.setRepeat(0); // Loop indefinitely
  encoder.setDelay(FRAME_INTERVAL); // Frame delay in ms
  encoder.setQuality(10);

  for (const frame of frames) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set background and text style
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${FONT_SIZE}px monospace`;

    // Split frame into lines and draw
    const lines = frame.split('\n');
    for (let i = 0; i < Math.min(lines.length, rows); i++) {
      ctx.fillText(lines[i].substring(0, cols), 0, (i + 1) * LINE_HEIGHT);
    }

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return stream;
}

// Start command handler
bot.command("start", async (ctx) => {
  const userId = ctx.from.id;
  const aspectRatio = ctx.match || '16:9';
  
  logger.info({ userId, aspectRatio }, 'Starting terminal session');
  
  if (!ASPECT_RATIOS[aspectRatio]) {
    await ctx.reply(`❌ Invalid aspect ratio. Available options:\n\n📱 **Choose terminal aspect ratio:**\n• \`/start 1:1\` - ${ASPECT_RATIOS['1:1'].name} (${ASPECT_RATIOS['1:1'].cols}x${ASPECT_RATIOS['1:1'].rows})\n• \`/start 16:9\` - ${ASPECT_RATIOS['16:9'].name} (${ASPECT_RATIOS['16:9'].cols}x${ASPECT_RATIOS['16:9'].rows})\n• \`/start 9:16\` - ${ASPECT_RATIOS['9:16'].name} (${ASPECT_RATIOS['9:16'].cols}x${ASPECT_RATIOS['9:16'].rows})\n\n💡 Default: \`/start\` uses 16:9`, { parse_mode: 'Markdown' });
    return;
  }
  
  const { cols, rows, name } = ASPECT_RATIOS[aspectRatio];
  
  try {
    if (userSessions.has(userId)) {
      logger.info({ userId }, 'Killing existing terminal session');
      userSessions.get(userId).terminal.kill();
      userSessions.delete(userId);
    }
    
    const terminal = pty.spawn(SHELL, [], {
      name: 'xterm-color',
      cols: cols,
      rows: rows,
      cwd: process.env.HOME,
      env: process.env
    });
    
    let output = '';
    let messageId = null;
    let updateTimeout = null;
    let lastMessageContent = '';
    
    terminal.onData((data) => {
      logger.debug({ 
        userId, 
        dataLength: data.length,
        dataPreview: data.substring(0, 50) + (data.length > 50 ? '...' : ''),
        totalOutputLength: output.length + data.length
      }, 'Terminal data received');
      output += data;
      
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        logger.debug({ userId }, 'Clearing previous update timeout');
      }
      updateTimeout = setTimeout(() => {
        logger.debug({ userId }, 'Debounced update timeout triggered');
        updateTerminalMessage();
      }, 150);
      logger.debug({ userId }, 'Set new update timeout for 150ms');
    });
    
    terminal.onExit((exitCode, signal) => {
      logger.info({ userId, exitCode, signal }, 'Terminal session ended');
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      userSessions.delete(userId);
      ctx.reply("🔴 Terminal session ended.");
    });
    
    async function updateTerminalMessage() {
      try {
        const formattedOutput = formatTerminalOutput(output, cols, rows);
        const messageText = `🚀 **Terminal ${name} (${cols}x${rows})** - Ready!

📱 **Aspect ratios:** \`/start 1:1\` \`/start 16:9\` \`/start 9:16\`
💬 Send commands as text messages

\`\`\`
${formattedOutput}
\`\`\``;
        
        if (messageText === lastMessageContent) {
          logger.debug({ userId }, 'Skipping update - content unchanged');
          return;
        }
        
        logger.debug({ 
          userId, 
          messageId, 
          outputLength: output.length, 
          messageLength: messageText.length,
          rawOutput: output.substring(0, 100) + (output.length > 100 ? '...' : ''),
          formattedPreview: formattedOutput.substring(0, 100) + (formattedOutput.length > 100 ? '...' : '')
        }, 'Updating terminal message');
        
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat.id, messageId, messageText, {
            parse_mode: "Markdown"
          });
          logger.debug({ userId, messageId }, 'Terminal message updated successfully');
          lastMessageContent = messageText;
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
          if (userSessions.has(userId)) {
            userSessions.get(userId).messageId = messageId;
          }
        }
      } catch (error) {
        if (error.error_code === 400 && error.message.includes('message is not modified')) {
          logger.debug({ userId }, 'Message content unchanged, skipping update');
          return;
        }
        
        logger.warn({ userId, error: error.message, errorCode: error.error_code }, 'Failed to update terminal message');
        
        if (error.error_code === 400 && !error.message.includes('message is not modified')) {
          try {
            const formattedOutput = formatTerminalOutput(output, cols, rows);
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
    
    userSessions.set(userId, {
      terminal,
      output,
      messageId,
      updateTerminalMessage,
      cols,
      rows
    });
    
    logger.info({ userId, aspectRatio: name, dimensions: `${cols}x${rows}` }, 'Terminal session created and stored');
    
    const initialOutput = formatTerminalOutput('', cols, rows);
    const initialMessage = `🚀 **Terminal ${name} (${cols}x${rows})** - Ready!

📱 **Aspect ratios:** \`/start 1:1\` \`/start 16:9\` \`/start 9:16\`
💬 Send commands as text messages

\`\`\`
${initialOutput}
\`\`\``;
    
    const message = await ctx.reply(initialMessage, { parse_mode: "Markdown" });
    messageId = message.message_id;
    lastMessageContent = initialMessage;
    
    if (userSessions.has(userId)) {
      userSessions.get(userId).messageId = messageId;
    }
    
    logger.debug({ userId, messageId }, 'Initial terminal message sent');
    
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

  if (!command) {
    logger.debug({ userId }, 'Empty command after parsing, skipping');
    return;
  }

  global.lastCommand = command;

  const interactiveCommands = ['top', 'htop'];
  const isInteractive = interactiveCommands.some(cmd => command.toLowerCase().startsWith(cmd));

  try {
    if (isInteractive) {
      logger.info({ userId, command }, 'Interactive command detected, generating animation');
      await ctx.reply(`🎥 Generating animation for \`${command}\`...`, { parse_mode: 'Markdown' });

      // Capture frames for animation
      const frames = [];
      let frameTimeout;
      const startTime = Date.now();

      const captureFrames = () => {
        frames.push(formatTerminalOutput(session.output, session.cols, session.rows));
        if (Date.now() - startTime < ANIMATION_DURATION) {
          frameTimeout = setTimeout(captureFrames, FRAME_INTERVAL);
        }
      };

      session.terminal.write(command + '\r');
      captureFrames();

      // Wait for animation duration and generate GIF
      await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION + 500));
      clearTimeout(frameTimeout);

      const animationStream = await generateTerminalAnimation(frames, session.cols, session.rows);
      const animationBuffer = await streamToBuffer(animationStream);

      // Send animation
      await ctx.replyWithAnimation({ source: animationBuffer }, {
        caption: `Animation of \`${command}\` (${ANIMATION_DURATION / 1000}s)`,
        parse_mode: 'Markdown'
      });

      // Send instructions to stop if needed
      await ctx.reply("ℹ️ To stop the command, send `^C` (Ctrl+C).", { parse_mode: 'Markdown' });
    } else {
      logger.info({ userId, command }, 'Executing regular terminal command');
      session.terminal.write(command + '\r');
    }
  } catch (error) {
    logger.error({ userId, command, error: error.message }, 'Failed to execute terminal command');
    await ctx.reply("❌ Failed to execute command. Check logs for details.");
    process.exit(1);
  }
});

// Helper function to convert stream to buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

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

// Error handling
bot.catch((err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Bot error occurred');
  process.exit(1);
});

// Graceful shutdown
process.once("SIGINT", () => {
  logger.info('Received SIGINT, shutting down gracefully...');
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