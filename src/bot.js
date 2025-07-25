import { Bot, InlineKeyboard } from "grammy";
import * as pty from "node-pty";
import { config } from "dotenv";

config();

const bot = new Bot(process.env.BOT_TOKEN);
const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID ? parseInt(process.env.AUTHORIZED_USER_ID) : null;
const AUTHORIZED_USERNAME = process.env.AUTHORIZED_USERNAME;
const TERMINAL_COLS = parseInt(process.env.TERMINAL_COLS) || 80;
const TERMINAL_ROWS = parseInt(process.env.TERMINAL_ROWS) || 24;
const SHELL = process.env.SHELL || "/bin/bash";

// Store terminal sessions per user (though we only allow one user)
const userSessions = new Map();

// Helper function to check if user is authorized
function isAuthorized(user) {
  if (AUTHORIZED_USER_ID && user.id === AUTHORIZED_USER_ID) {
    return true;
  }
  
  if (AUTHORIZED_USERNAME && user.username) {
    const username = AUTHORIZED_USERNAME.startsWith('@') 
      ? AUTHORIZED_USERNAME.substring(1) 
      : AUTHORIZED_USERNAME;
    return user.username === username;
  }
  
  return false;
}

// Middleware to check if user is authorized
bot.use((ctx, next) => {
  if (!isAuthorized(ctx.from)) {
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
  // Remove triple backticks if present
  if (text.startsWith('```') && text.endsWith('```')) {
    return text.slice(3, -3).trim();
  }
  
  // Remove single backticks if present
  if (text.startsWith('`') && text.endsWith('`')) {
    return text.slice(1, -1);
  }
  
  // Return plain text
  return text.trim();
}

// Start command handler
bot.command("start", async (ctx) => {
  const userId = ctx.from.id;
  
  // Kill existing session if any
  if (userSessions.has(userId)) {
    userSessions.get(userId).terminal.kill();
    userSessions.delete(userId);
  }
  
  // Create new terminal session
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
    output += data;
    updateTerminalMessage();
  });
  
  // Handle terminal exit
  terminal.onExit(() => {
    userSessions.delete(userId);
    ctx.reply("🔴 Terminal session ended.");
  });
  
  // Function to update the terminal message
  async function updateTerminalMessage() {
    const formattedOutput = formatTerminalOutput(output);
    const messageText = `\`\`\`\n${formattedOutput}\n\`\`\``;
    
    try {
      if (messageId) {
        await ctx.api.editMessageText(ctx.chat.id, messageId, messageText, {
          parse_mode: "Markdown"
        });
      } else {
        const message = await ctx.reply(messageText, {
          parse_mode: "Markdown"
        });
        messageId = message.message_id;
      }
    } catch (error) {
      // If editing fails (e.g., message too old), send a new message
      if (error.error_code === 400) {
        try {
          const message = await ctx.reply(messageText, {
            parse_mode: "Markdown"
          });
          messageId = message.message_id;
        } catch (e) {
          console.error("Failed to send terminal update:", e);
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
  
  // Send initial welcome message
  await ctx.reply("🚀 Terminal session started! Send commands as messages.");
  
  // Wait a bit for initial shell prompt, then update
  setTimeout(updateTerminalMessage, 500);
});

// Handle all text messages as terminal commands
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  
  if (!session) {
    return ctx.reply("❌ No active terminal session. Use /start to begin.");
  }
  
  const command = parseCommandInput(ctx.message.text);
  
  // Skip if the message is empty after parsing
  if (!command) {
    return;
  }
  
  // Send command to terminal
  session.terminal.write(command + '\r');
});

// Handle stop command
bot.command("stop", async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  
  if (session) {
    session.terminal.kill();
    userSessions.delete(userId);
    await ctx.reply("🛑 Terminal session stopped.");
  } else {
    await ctx.reply("❌ No active terminal session.");
  }
});

// Handle restart command
bot.command("restart", async (ctx) => {
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
});

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

// Graceful shutdown
process.once("SIGINT", () => {
  console.log("Shutting down bot...");
  // Kill all terminal sessions
  for (const [userId, session] of userSessions) {
    session.terminal.kill();
  }
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log("Shutting down bot...");
  // Kill all terminal sessions
  for (const [userId, session] of userSessions) {
    session.terminal.kill();
  }
  process.exit(0);
});

console.log("Starting Telegram Terminal Bot...");
bot.start();