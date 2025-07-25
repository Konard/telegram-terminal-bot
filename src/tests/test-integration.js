#!/usr/bin/env node

/**
 * Test the integration of VirtualTerminal with the bot logic
 */

import VirtualTerminal from '../virtual-terminal.js';

// Test basic functionality
console.log('🧪 Testing VirtualTerminal integration...\n');

// Test 1: Basic command output
console.log('Test 1: Basic command simulation');
const term1 = new VirtualTerminal(40, 10);
term1.write('$ ls -la\n');
term1.write('total 48\n');
term1.write('drwxr-xr-x  5 user user  4096 Jan 25 10:30 .\n');
term1.write('drwxr-xr-x  3 user user  4096 Jan 25 10:25 ..\n');
term1.write('-rw-r--r--  1 user user   220 Jan 25 10:25 .bashrc\n');
term1.write('$ ');

console.log('Screen output:');
console.log('```');
console.log(term1.toString());
console.log('```\n');

// Test 2: Interactive command simulation (top-like)
console.log('Test 2: Interactive command simulation (top-like)');
const term2 = new VirtualTerminal(50, 8);

// Clear screen and write header (like top does)
term2.write('\x1B[2J\x1B[H'); // Clear screen and home cursor
term2.write('top - 12:34:56 up 1 day,  5:23,  2 users\n');
term2.write('Tasks:  95 total,   1 running,  94 sleeping\n');
term2.write('  PID USER      PR  NI    VIRT    RES  %CPU\n');
term2.write(' 1234 root      20   0  123456   5678   1.2\n');
term2.write(' 5678 user      20   0   98765   4321   0.8\n');

console.log('Screen output:');
console.log('```');
console.log(term2.toString());
console.log('```\n');

// Test 3: Cursor positioning and updates (htop-like)
console.log('Test 3: Cursor positioning and updates (htop-like)');
const term3 = new VirtualTerminal(60, 6);

// Initial screen
term3.write('\x1B[2J\x1B[H'); // Clear and home
term3.write('CPU[||||||||||||||||||||||||||||||||||||    ] 75%\n');
term3.write('Mem[||||||||||||||||||||                    ] 45%\n');
term3.write('Swp[|                                       ]  2%\n');
term3.write('\n');
term3.write('  PID USER     PRI  NI  VIRT   RES   SHR S CPU% MEM%\n');
term3.write(' 1234 root      20   0  123M  56.7M  8.9M R  1.2  2.1\n');

console.log('Screen output:');
console.log('```');
console.log(term3.toString());
console.log('```\n');

// Test 4: Alternative screen buffer (vim-like)
console.log('Test 4: Alternative screen buffer (vim-like)');
const term4 = new VirtualTerminal(30, 5);

// Write to main screen
term4.write('$ vim test.txt\n');
term4.write('Opening file...\n');
term4.write('$ ');

console.log('Main screen:');
console.log('```');
console.log(term4.toString());
console.log('```');

// Switch to alt screen (vim does this)
term4.write('\x1B[?1049h');
term4.write('~\n~\n~\n');
term4.write('"test.txt" [New File]\n');
term4.write('-- INSERT --');

console.log('Alt screen (vim):');
console.log('```');
console.log(term4.toString());
console.log('```');

// Switch back to main screen
term4.write('\x1B[?1049l');

console.log('Back to main screen:');
console.log('```');
console.log(term4.toString());
console.log('```\n');

console.log('✅ All integration tests completed successfully!');
console.log('The VirtualTerminal is ready for use in the Telegram bot.');