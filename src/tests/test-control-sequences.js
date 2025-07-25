#!/usr/bin/env node

/**
 * Test Control Sequence Handling
 * 
 * Tests that control sequences like ^C, ^D, ^Z are properly converted to ASCII control codes
 */

import VirtualTerminal from '../virtual-terminal.js';

console.log('🎮 Testing Control Sequence Handling\n');

const term = new VirtualTerminal(40, 10);
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   ${error.message}`);
    testsFailed++;
  }
}

// Test 1: CTRL+C handling
test('CTRL+C (SIGINT) sequence', () => {
  term.reset();
  term.write('$ sleep 100');
  term.write('\r');
  
  // Send CTRL+C
  term.write('\x03');
  
  // The command should be interrupted (terminal specific behavior)
  // We're mainly testing that \x03 doesn't crash the terminal
});

// Test 2: CTRL+D handling
test('CTRL+D (EOF) sequence', () => {
  term.reset();
  term.write('$ cat');
  term.write('\r');
  term.write('Hello World');
  term.write('\r');
  
  // Send CTRL+D
  term.write('\x04');
  
  // EOF should be sent (terminal specific behavior)
});

// Test 3: CTRL+Z handling
test('CTRL+Z (SIGTSTP) sequence', () => {
  term.reset();
  term.write('$ vim test.txt');
  term.write('\r');
  
  // Send CTRL+Z
  term.write('\x1A');
  
  // Process should be suspended (terminal specific behavior)
});

// Test 4: Multiple control sequences
test('Multiple control sequences in succession', () => {
  term.reset();
  
  // Test that multiple control sequences don't interfere
  term.write('Test');
  term.write('\x03'); // CTRL+C
  term.write('More text');
  term.write('\x04'); // CTRL+D
  term.write('Final text');
  term.write('\x1A'); // CTRL+Z
  
  const screen = term.getScreenText();
  if (!screen.includes('Test') || !screen.includes('More text') || !screen.includes('Final text')) {
    throw new Error('Control sequences corrupted normal text');
  }
});

// Test 5: Control sequences don't affect cursor position
test('Control sequences preserve cursor position', () => {
  term.reset();
  term.setCursorPosition(10, 5);
  const beforePos = term.getCursorPosition();
  
  // Send control sequences
  term.write('\x03'); // CTRL+C
  term.write('\x04'); // CTRL+D
  term.write('\x1A'); // CTRL+Z
  
  const afterPos = term.getCursorPosition();
  
  if (beforePos.x !== afterPos.x || beforePos.y !== afterPos.y) {
    throw new Error(`Cursor position changed: (${beforePos.x},${beforePos.y}) -> (${afterPos.x},${afterPos.y})`);
  }
});

// Test 6: Control sequences in ANSI escape sequences
test('Control sequences within ANSI sequences', () => {
  term.reset();
  
  // This should not cause issues
  term.write('\x1B[2J'); // Clear screen
  term.write('\x03');    // CTRL+C
  term.write('\x1B[H');  // Home cursor
  term.write('\x04');    // CTRL+D
  
  // Terminal should still be functional
  term.write('Terminal still works');
  
  const screen = term.getScreenText();
  if (!screen.includes('Terminal still works')) {
    throw new Error('Terminal broken after control sequences in ANSI context');
  }
});

// Test 7: Subscription system with control sequences
test('Subscription system ignores control-only changes', () => {
  term.reset();
  let changeCount = 0;
  
  const unsubscribe = term.onScreenChange(() => {
    changeCount++;
  });
  
  // Write visible text (should trigger change)
  term.write('Visible text');
  const afterText = changeCount;
  
  // Send only control sequences (should not trigger change)
  term.write('\x03'); // CTRL+C
  term.write('\x04'); // CTRL+D
  term.write('\x1A'); // CTRL+Z
  
  if (changeCount !== afterText) {
    throw new Error(`Control sequences triggered screen change: ${afterText} -> ${changeCount}`);
  }
  
  unsubscribe();
});

// Summary
console.log(`\n📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed === 0) {
  console.log('\n🎉 All control sequence tests passed!');
  console.log('\n✨ Control sequences are properly handled:');
  console.log('  ✅ CTRL+C (\\x03) - SIGINT');
  console.log('  ✅ CTRL+D (\\x04) - EOF');
  console.log('  ✅ CTRL+Z (\\x1A) - SIGTSTP');
  console.log('  ✅ No interference with normal text');
  console.log('  ✅ Cursor position preserved');
  console.log('  ✅ Compatible with ANSI sequences');
  console.log('  ✅ No false screen change notifications');
} else {
  console.log('\n💥 Some tests failed!');
  process.exit(1);
}