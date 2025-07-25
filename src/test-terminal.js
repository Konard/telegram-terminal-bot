#!/usr/bin/env node

/**
 * Test Suite for VirtualTerminal
 * 
 * This file tests the terminal emulator with various ANSI sequences
 * and common terminal applications behavior.
 */

import VirtualTerminal from './VirtualTerminal.js';

class TerminalTester {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
    }
  }

  assertPosition(terminal, x, y, message) {
    const pos = terminal.getCursorPosition();
    if (pos.x !== x || pos.y !== y) {
      throw new Error(`${message}\nExpected cursor at (${x}, ${y})\nActual cursor at (${pos.x}, ${pos.y})`);
    }
  }

  assertScreen(terminal, expected, message) {
    const actual = terminal.toString();
    if (actual !== expected) {
      throw new Error(`${message}\nExpected screen:\n${expected}\nActual screen:\n${actual}`);
    }
  }

  run() {
    console.log('🧪 Running VirtualTerminal Tests\n');

    for (const { name, testFn } of this.tests) {
      try {
        testFn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   ${error.message}\n`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

const tester = new TerminalTester();

// Basic functionality tests
tester.test('Basic character printing', () => {
  const term = new VirtualTerminal(10, 3);
  term.write('Hello');
  
  const screen = term.toString();
  const expected = 'Hello     \n          \n          ';
  tester.assertEqual(screen, expected, 'Basic text should print correctly');
  tester.assertPosition(term, 5, 0, 'Cursor should advance after printing');
});

tester.test('Line wrapping', () => {
  const term = new VirtualTerminal(5, 3);
  term.write('HelloWorld');
  
  const lines = term.toString().split('\n');
  tester.assertEqual(lines[0], 'Hello', 'First line should contain "Hello"');
  tester.assertEqual(lines[1], 'World', 'Second line should contain "World"');
  tester.assertPosition(term, 5, 1, 'Cursor should be at end of second line');
});

tester.test('Carriage return and line feed', () => {
  const term = new VirtualTerminal(10, 3);
  term.write('Hello\r\nWorld');
  
  const lines = term.toString().split('\n');
  tester.assertEqual(lines[0], 'Hello     ', 'First line should contain "Hello"');
  tester.assertEqual(lines[1], 'World     ', 'Second line should contain "World"');
  tester.assertPosition(term, 5, 1, 'Cursor should be after "World"');
});

// Cursor movement tests
tester.test('Cursor up (ESC[A)', () => {
  const term = new VirtualTerminal(10, 5);
  term.write('Line1\nLine2\nLine3');
  // After writing 3 lines, cursor is at (5, 2)
  term.write('\x1B[2A'); // Move up 2 lines
  
  tester.assertPosition(term, 5, 0, 'Cursor should move up 2 lines from row 2 to row 0');
});

tester.test('Cursor positioning (ESC[H)', () => {
  const term = new VirtualTerminal(10, 5);
  term.write('\x1B[3;4H'); // Move to row 3, col 4
  
  tester.assertPosition(term, 3, 2, 'Cursor should move to specified position (0-indexed)');
});

tester.test('Cursor save and restore', () => {
  const term = new VirtualTerminal(10, 5);
  term.write('\x1B[3;4H'); // Move to position
  term.write('\x1B[s');    // Save cursor
  term.write('\x1B[1;1H'); // Move to different position
  term.write('\x1B[u');    // Restore cursor
  
  tester.assertPosition(term, 3, 2, 'Cursor should restore to saved position');
});

// Screen clearing tests
tester.test('Clear screen (ESC[2J)', () => {
  const term = new VirtualTerminal(5, 3);
  term.write('Hello\nWorld\nTest');
  term.write('\x1B[2J'); // Clear screen
  
  const expected = '     \n     \n     ';
  tester.assertScreen(term, expected, 'Screen should be cleared');
  tester.assertPosition(term, 0, 0, 'Cursor should be at origin after clear');
});

tester.test('Clear line (ESC[K)', () => {
  const term = new VirtualTerminal(15, 3);
  term.write('Hello World\nSecond Line\nThird Line');
  term.write('\x1B[2;6H'); // Move to second line, position 6 (0-indexed: row 1, col 5)
  term.write('\x1B[K');    // Clear from cursor to end of line
  
  const lines = term.toString().split('\n');
  tester.assertEqual(lines[1], 'Secon          ', 'Line should be cleared from cursor to end');
});

// Scrolling tests
tester.test('Scrolling with multiple lines', () => {
  const term = new VirtualTerminal(5, 3);
  term.write('L1\nL2\nL3\nL4\nL5'); // Write more lines than screen height
  
  const lines = term.toString().split('\n');
  tester.assertEqual(lines[0], 'L3   ', 'First line should be L3 after scrolling');
  tester.assertEqual(lines[1], 'L4   ', 'Second line should be L4');
  tester.assertEqual(lines[2], 'L5   ', 'Third line should be L5');
});

// ANSI color tests (basic)
tester.test('Color codes parsing', () => {
  const term = new VirtualTerminal(10, 3);
  term.write('\x1B[31mRed\x1B[0m'); // Red text, then reset
  
  // Just ensure it doesn't crash - color rendering not implemented yet
  const screen = term.toString();
  tester.assertEqual(screen.includes('Red'), true, 'Text should still be printed with color codes');
});

// Complex sequence tests
tester.test('Complex cursor movements', () => {
  const term = new VirtualTerminal(10, 5);
  
  // Write some text
  term.write('1234567890\nABCDEFGHIJ\nqwertyuiop');
  
  // Move to specific position and write
  term.write('\x1B[2;3H'); // Row 2, Col 3
  term.write('X');
  
  const lines = term.toString().split('\n');
  tester.assertEqual(lines[1], 'ABXDEFGHIJ', 'Character should be inserted at correct position');
  tester.assertPosition(term, 3, 1, 'Cursor should advance after writing');
});

// Alternative screen buffer test
tester.test('Alternative screen buffer', () => {
  const term = new VirtualTerminal(5, 3);
  
  // Write to main screen
  term.write('Main\nScreen\nText');
  const mainScreen = term.toString();
  
  // Switch to alt screen
  term.write('\x1B[?1049h');
  term.write('Alt\nBuffer\nMode');
  const altScreen = term.toString();
  
  // Switch back to main screen
  term.write('\x1B[?1049l');
  const restoredScreen = term.toString();
  
  tester.assertEqual(mainScreen !== altScreen, true, 'Alt screen should be different from main');
  tester.assertEqual(restoredScreen, mainScreen, 'Main screen should be restored');
});

// Tab handling test
tester.test('Tab character handling', () => {
  const term = new VirtualTerminal(20, 3);
  term.write('A\tB\tC'); // Tab stops should be at 8, 16, etc.
  
  const line = term.toString().split('\n')[0];
  tester.assertEqual(line[0], 'A', 'First char should be A');
  tester.assertEqual(line[8], 'B', 'B should be at tab stop 8');
  tester.assertEqual(line[16], 'C', 'C should be at tab stop 16');
});

// Backspace test
tester.test('Backspace handling', () => {
  const term = new VirtualTerminal(10, 3);
  term.write('Hello\x08X'); // Write Hello, backspace, then X
  
  const line = term.toString().split('\n')[0];
  tester.assertEqual(line.substring(0, 6), 'HellX ', 'Backspace should move cursor back');
});

// Real-world simulation tests
tester.test('Simulate top-like output', () => {
  const term = new VirtualTerminal(40, 10);
  
  // Simulate clearing screen and writing header
  term.write('\x1B[2J\x1B[H'); // Clear screen and home cursor
  term.write('top - 12:34:56 up 1 day,  5:23,  2 users\n');
  term.write('Tasks:  95 total,   1 running,  94 sleeping\n');
  term.write('  PID USER      PR  NI    VIRT    RES  %CPU\n');
  term.write(' 1234 root      20   0  123456   5678   1.2\n');
  
  const screen = term.toString();
  tester.assertEqual(screen.includes('top - 12:34:56'), true, 'Should contain top header');
  tester.assertEqual(screen.includes('PID USER'), true, 'Should contain column headers');
});

tester.test('Simulate htop-like colors', () => {
  const term = new VirtualTerminal(30, 5);
  
  // Simulate htop with colors
  term.write('\x1B[2J\x1B[H'); // Clear and home
  term.write('\x1B[1m'); // Bold
  term.write('CPU[');
  term.write('\x1B[31m'); // Red
  term.write('||||');
  term.write('\x1B[32m'); // Green  
  term.write('    ');
  term.write('\x1B[0m'); // Reset
  term.write(']\n');
  
  const screen = term.toString();
  tester.assertEqual(screen.includes('CPU[||||    ]'), true, 'Should render htop-style display');
});

// Edge case tests
tester.test('Cursor bounds checking', () => {
  const term = new VirtualTerminal(5, 3);
  
  // Try to move cursor out of bounds
  term.write('\x1B[10;10H'); // Try to move to 10,10 on 5x3 screen
  
  const pos = term.getCursorPosition();
  tester.assertEqual(pos.x <= 4, true, 'Cursor X should be within bounds');
  tester.assertEqual(pos.y <= 2, true, 'Cursor Y should be within bounds');
});

tester.test('Large text input', () => {
  const term = new VirtualTerminal(20, 5);
  
  // Write a lot of text
  const largeText = 'A'.repeat(1000);
  term.write(largeText);
  
  // Should not crash and should handle gracefully
  const screen = term.toString();
  tester.assertEqual(screen.includes('A'), true, 'Should contain some of the text');
});

tester.test('Resize terminal', () => {
  const term = new VirtualTerminal(10, 5);
  term.write('Hello\nWorld\nTest\nMore\nText');
  
  // Resize to smaller
  term.resize(8, 3);
  
  const screen = term.toString();
  const lines = screen.split('\n');
  tester.assertEqual(lines.length, 3, 'Should have 3 lines after resize');
  tester.assertEqual(lines[0].length, 8, 'Lines should be 8 characters wide');
});

// Performance test
tester.test('Performance test - lots of output', () => {
  const term = new VirtualTerminal(80, 24);
  
  const start = Date.now();
  
  // Simulate a lot of terminal output
  for (let i = 0; i < 1000; i++) {
    term.write(`Line ${i}: This is a test line with some text\n`);
  }
  
  const end = Date.now();
  const duration = end - start;
  
  console.log(`   Performance: Processed 1000 lines in ${duration}ms`);
  tester.assertEqual(duration < 1000, true, 'Should process 1000 lines in under 1 second');
});

// Run the tests
const success = tester.run();

if (success) {
  console.log('\n🎉 All tests passed! The VirtualTerminal is ready to use.');
} else {
  console.log('\n💥 Some tests failed. Please fix the issues before using.');
  process.exit(1);
}