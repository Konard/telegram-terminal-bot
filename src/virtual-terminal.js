/**
 * Virtual Terminal Emulator
 * Implements a proper terminal screen buffer with ANSI escape sequence support
 */

class VirtualTerminal {
  constructor(cols = 56, rows = 32) {
    this.cols = cols;
    this.rows = rows;
    
    // Screen buffer - 2D array of characters
    this.buffer = this.createEmptyBuffer();
    
    // Cursor state
    this.cursor = { x: 0, y: 0 };
    this.savedCursor = { x: 0, y: 0 };
    this.cursorVisible = true;
    
    // Terminal state
    this.scrollRegion = { top: 0, bottom: rows - 1 };
    this.altScreenBuffer = null;
    this.isAltScreen = false;
    
    // Character attributes (for future color support)
    this.currentAttr = {
      fg: 'white',
      bg: 'black',
      bold: false,
      underline: false,
      reverse: false
    };
    
    // Parse state for escape sequences
    this.parseState = {
      state: 'normal', // 'normal', 'escape', 'csi', 'osc'
      params: [],
      current: '',
      intermediate: ''
    };
    
    // Debug and verbose modes
    this.debug = false;
    this.verbose = false;
    this.frameCounter = 0;
    
    // Change subscription system
    this.changeListeners = new Set();
    this.lastScreenHash = null;
    this.hasChangedSinceLastCheck = false;
  }
  
  createEmptyBuffer() {
    return Array(this.rows).fill(null).map(() => 
      Array(this.cols).fill(null).map(() => ({
        char: ' ',
        attr: { ...this.currentAttr }
      }))
    );
  }
  
  // Main input processing function
  write(data) {
    if (this.debug) {
      console.log('VirtualTerminal.write:', JSON.stringify(data));
    }
    
    if (this.verbose) {
      console.log(`\n=== INPUT [${new Date().toISOString()}] ===`);
      console.log('Raw data:', JSON.stringify(data));
      console.log('Length:', data.length);
      console.log('Cursor before:', JSON.stringify(this.cursor));
    }
    
    // Always capture screen state for change detection
    const screenBefore = this.toString();
    
    for (let i = 0; i < data.length; i++) {
      this.processChar(data[i]);
    }
    
    const screenAfter = this.toString();
    const hasChanged = screenBefore !== screenAfter;
    
    if (hasChanged) {
      this.frameCounter++;
      this.hasChangedSinceLastCheck = true;
      
      // Notify all change listeners
      const changeData = {
        frameNumber: this.frameCounter,
        timestamp: new Date(),
        screenBefore,
        screenAfter,
        cursorPosition: this.getCursorPosition(),
        inputData: data
      };
      
      this.notifyChangeListeners(changeData);
    }
    
    if (this.verbose) {
      console.log('Cursor after:', JSON.stringify(this.cursor));
      
      if (hasChanged) {
        console.log(`\n--- SCREEN CHANGE (Frame ${this.frameCounter}) ---`);
        console.log('BEFORE:');
        this.logScreen(screenBefore);
        console.log('\nAFTER:');
        this.logScreen(screenAfter);
        console.log('--- END SCREEN CHANGE ---');
      } else {
        console.log('No screen changes detected.');
      }
    }
  }
  
  processChar(char) {
    const code = char.charCodeAt(0);
    
    switch (this.parseState.state) {
      case 'normal':
        this.handleNormalChar(char, code);
        break;
      case 'escape':
        this.handleEscapeChar(char, code);
        break;
      case 'csi':
        this.handleCSIChar(char, code);
        break;
      case 'osc':
        this.handleOSCChar(char, code);
        break;
    }
  }
  
  handleNormalChar(char, code) {
    switch (code) {
      case 0x1B: // ESC
        this.parseState = { state: 'escape', params: [], current: '', intermediate: '' };
        break;
      case 0x08: // Backspace
        this.moveCursorLeft();
        break;
      case 0x09: // Tab
        this.tab();
        break;
      case 0x0A: // Line Feed (LF)
        this.lineFeed();
        break;
      case 0x0D: // Carriage Return (CR)
        this.carriageReturn();
        break;
      case 0x07: // Bell
        // Ignore bell for now
        break;
      default:
        if (code >= 32 || code === 0x0A) { // Printable chars
          this.printChar(char);
        }
        break;
    }
  }
  
  handleEscapeChar(char, code) {
    switch (char) {
      case '[':
        this.parseState.state = 'csi';
        break;
      case ']':
        this.parseState.state = 'osc';
        break;
      case 'D': // Index (move down)
        this.index();
        this.parseState.state = 'normal';
        break;
      case 'M': // Reverse Index (move up)
        this.reverseIndex();
        this.parseState.state = 'normal';
        break;
      case 'E': // Next Line
        this.nextLine();
        this.parseState.state = 'normal';
        break;
      case '7': // Save cursor
        this.saveCursor();
        this.parseState.state = 'normal';
        break;
      case '8': // Restore cursor
        this.restoreCursor();
        this.parseState.state = 'normal';
        break;
      case 'c': // Reset
        this.reset();
        this.parseState.state = 'normal';
        break;
      default:
        // Unknown escape sequence, return to normal
        this.parseState.state = 'normal';
        break;
    }
  }
  
  handleCSIChar(char, code) {
    // CSI (Control Sequence Introducer) parameters
    if (code >= 48 && code <= 57) { // 0-9
      this.parseState.current += char;
    } else if (char === ';') {
      this.parseState.params.push(parseInt(this.parseState.current) || 0);
      this.parseState.current = '';
    } else if (code >= 32 && code <= 47) { // Intermediate chars (space to /)
      this.parseState.intermediate += char;
    } else if (char === '?') { // Special case for ? parameter
      this.parseState.intermediate += char;
    } else {
      // Final character
      if (this.parseState.current) {
        this.parseState.params.push(parseInt(this.parseState.current) || 0);
      }
      this.handleCSISequence(char, this.parseState.params, this.parseState.intermediate);
      this.parseState.state = 'normal';
    }
  }
  
  handleOSCChar(char, code) {
    if (code === 0x07 || char === '\\') { // Bell or String Terminator
      this.parseState.state = 'normal';
    }
    // For now, ignore OSC sequences (title setting, etc.)
  }
  
  handleCSISequence(finalChar, params, intermediate) {
    if (this.debug) {
      console.log('CSI:', finalChar, params, intermediate);
    }
    
    switch (finalChar) {
      case 'A': // Cursor Up
        this.moveCursorUp(params[0] || 1);
        break;
      case 'B': // Cursor Down
        this.moveCursorDown(params[0] || 1);
        break;
      case 'C': // Cursor Right
        this.moveCursorRight(params[0] || 1);
        break;
      case 'D': // Cursor Left
        this.moveCursorLeft(params[0] || 1);
        break;
      case 'H': // Cursor Position
      case 'f': // Horizontal and Vertical Position
        this.setCursorPosition(params[1] || 1, params[0] || 1);
        break;
      case 'J': // Erase in Display
        this.eraseInDisplay(params[0] || 0);
        break;
      case 'K': // Erase in Line
        this.eraseInLine(params[0] || 0);
        break;
      case 'L': // Insert Lines
        this.insertLines(params[0] || 1);
        break;
      case 'M': // Delete Lines
        this.deleteLines(params[0] || 1);
        break;
      case 'P': // Delete Characters
        this.deleteCharacters(params[0] || 1);
        break;
      case 'S': // Scroll Up
        this.scrollUp(params[0] || 1);
        break;
      case 'T': // Scroll Down
        this.scrollDown(params[0] || 1);
        break;
      case 'd': // Line Position Absolute
        this.setCursorPosition(this.cursor.x + 1, params[0] || 1);
        break;
      case 'G': // Cursor Character Absolute
        this.setCursorPosition(params[0] || 1, this.cursor.y + 1);
        break;
      case 'r': // Set Scrolling Region
        this.setScrollRegion(params[0] || 1, params[1] || this.rows);
        break;
      case 'm': // Select Graphic Rendition (colors, etc.)
        this.setGraphicRendition(params);
        break;
      case 'h': // Set Mode
        this.setMode(params, intermediate);
        break;
      case 'l': // Reset Mode
        this.resetMode(params, intermediate);
        break;
      case 's': // Save cursor position
        this.saveCursor();
        break;
      case 'u': // Restore cursor position
        this.restoreCursor();
        break;
      default:
        if (this.debug) {
          console.log('Unhandled CSI sequence:', finalChar, params);
        }
        break;
    }
  }
  
  // Cursor movement methods
  moveCursorUp(count = 1) {
    this.cursor.y = Math.max(0, this.cursor.y - count);
  }
  
  moveCursorDown(count = 1) {
    this.cursor.y = Math.min(this.rows - 1, this.cursor.y + count);
  }
  
  moveCursorRight(count = 1) {
    this.cursor.x = Math.min(this.cols - 1, this.cursor.x + count);
  }
  
  moveCursorLeft(count = 1) {
    this.cursor.x = Math.max(0, this.cursor.x - count);
  }
  
  setCursorPosition(col, row) {
    this.cursor.x = Math.max(0, Math.min(this.cols - 1, col - 1));
    this.cursor.y = Math.max(0, Math.min(this.rows - 1, row - 1));
  }
  
  saveCursor() {
    this.savedCursor = { ...this.cursor };
  }
  
  restoreCursor() {
    this.cursor = { ...this.savedCursor };
  }
  
  // Character printing
  printChar(char) {
    if (this.cursor.x >= this.cols) {
      this.cursor.x = 0;
      this.lineFeed();
    }
    
    this.buffer[this.cursor.y][this.cursor.x] = {
      char: char,
      attr: { ...this.currentAttr }
    };
    
    this.cursor.x++;
  }
  
  // Line operations
  lineFeed() {
    this.cursor.x = 0; // LF should also do CR in terminal emulation
    if (this.cursor.y >= this.rows - 1) {
      this.scrollUp();
    } else {
      this.cursor.y++;
    }
  }
  
  carriageReturn() {
    this.cursor.x = 0;
  }
  
  nextLine() {
    this.carriageReturn();
    this.lineFeed();
  }
  
  tab() {
    const nextTab = Math.floor(this.cursor.x / 8) * 8 + 8;
    this.cursor.x = Math.min(nextTab, this.cols - 1);
  }
  
  index() {
    this.lineFeed();
  }
  
  reverseIndex() {
    if (this.cursor.y <= this.scrollRegion.top) {
      this.scrollDown();
    } else {
      this.cursor.y--;
    }
  }
  
  // Erase operations
  eraseInDisplay(mode) {
    switch (mode) {
      case 0: // Erase from cursor to end of screen
        this.eraseInLine(0);
        for (let y = this.cursor.y + 1; y < this.rows; y++) {
          this.clearLine(y);
        }
        break;
      case 1: // Erase from beginning of screen to cursor
        for (let y = 0; y < this.cursor.y; y++) {
          this.clearLine(y);
        }
        this.eraseInLine(1);
        break;
      case 2: // Erase entire screen
        this.clearScreen();
        break;
    }
  }
  
  eraseInLine(mode) {
    const y = this.cursor.y;
    switch (mode) {
      case 0: // Erase from cursor to end of line
        for (let x = this.cursor.x; x < this.cols; x++) {
          this.buffer[y][x] = { char: ' ', attr: { ...this.currentAttr } };
        }
        break;
      case 1: // Erase from beginning of line to cursor
        for (let x = 0; x <= this.cursor.x; x++) {
          this.buffer[y][x] = { char: ' ', attr: { ...this.currentAttr } };
        }
        break;
      case 2: // Erase entire line
        this.clearLine(y);
        break;
    }
  }
  
  clearLine(y) {
    for (let x = 0; x < this.cols; x++) {
      this.buffer[y][x] = { char: ' ', attr: { ...this.currentAttr } };
    }
  }
  
  clearScreen() {
    this.buffer = this.createEmptyBuffer();
    this.cursor = { x: 0, y: 0 };
  }
  
  // Scrolling operations
  scrollUp(count = 1) {
    for (let i = 0; i < count; i++) {
      // Remove top line from scroll region
      for (let y = this.scrollRegion.top; y < this.scrollRegion.bottom; y++) {
        this.buffer[y] = this.buffer[y + 1].map(cell => ({ ...cell }));
      }
      // Clear bottom line
      this.clearLine(this.scrollRegion.bottom);
    }
  }
  
  scrollDown(count = 1) {
    for (let i = 0; i < count; i++) {
      // Move lines down in scroll region
      for (let y = this.scrollRegion.bottom; y > this.scrollRegion.top; y--) {
        this.buffer[y] = [...this.buffer[y - 1]];
      }
      // Clear top line
      this.clearLine(this.scrollRegion.top);
    }
  }
  
  // Line insertion/deletion
  insertLines(count) {
    for (let i = 0; i < count; i++) {
      // Move lines down
      for (let y = this.scrollRegion.bottom; y > this.cursor.y; y--) {
        this.buffer[y] = [...this.buffer[y - 1]];
      }
      this.clearLine(this.cursor.y);
    }
  }
  
  deleteLines(count) {
    for (let i = 0; i < count; i++) {
      // Move lines up
      for (let y = this.cursor.y; y < this.scrollRegion.bottom; y++) {
        this.buffer[y] = [...this.buffer[y + 1]];
      }
      this.clearLine(this.scrollRegion.bottom);
    }
  }
  
  deleteCharacters(count) {
    const y = this.cursor.y;
    for (let i = 0; i < count; i++) {
      // Shift characters left
      for (let x = this.cursor.x; x < this.cols - 1; x++) {
        this.buffer[y][x] = { ...this.buffer[y][x + 1] };
      }
      // Clear last character
      this.buffer[y][this.cols - 1] = { char: ' ', attr: { ...this.currentAttr } };
    }
  }
  
  // Terminal modes and settings
  setScrollRegion(top, bottom) {
    this.scrollRegion.top = Math.max(0, top - 1);
    this.scrollRegion.bottom = Math.min(this.rows - 1, bottom - 1);
    this.cursor = { x: 0, y: this.scrollRegion.top };
  }
  
  setGraphicRendition(params) {
    if (params.length === 0) params = [0];
    
    for (const param of params) {
      switch (param) {
        case 0: // Reset
          this.currentAttr = { fg: 'white', bg: 'black', bold: false, underline: false, reverse: false };
          break;
        case 1: // Bold
          this.currentAttr.bold = true;
          break;
        case 4: // Underline
          this.currentAttr.underline = true;
          break;
        case 7: // Reverse
          this.currentAttr.reverse = true;
          break;
        case 22: // Normal intensity
          this.currentAttr.bold = false;
          break;
        case 24: // No underline
          this.currentAttr.underline = false;
          break;
        case 27: // No reverse
          this.currentAttr.reverse = false;
          break;
        // Foreground colors (30-37, 90-97)
        case 30: this.currentAttr.fg = 'black'; break;
        case 31: this.currentAttr.fg = 'red'; break;
        case 32: this.currentAttr.fg = 'green'; break;
        case 33: this.currentAttr.fg = 'yellow'; break;
        case 34: this.currentAttr.fg = 'blue'; break;
        case 35: this.currentAttr.fg = 'magenta'; break;
        case 36: this.currentAttr.fg = 'cyan'; break;
        case 37: this.currentAttr.fg = 'white'; break;
        // Background colors (40-47, 100-107)
        case 40: this.currentAttr.bg = 'black'; break;
        case 41: this.currentAttr.bg = 'red'; break;
        case 42: this.currentAttr.bg = 'green'; break;
        case 43: this.currentAttr.bg = 'yellow'; break;
        case 44: this.currentAttr.bg = 'blue'; break;
        case 45: this.currentAttr.bg = 'magenta'; break;
        case 46: this.currentAttr.bg = 'cyan'; break;
        case 47: this.currentAttr.bg = 'white'; break;
      }
    }
  }
  
  setMode(params, intermediate) {
    for (const param of params) {
      if (intermediate === '?') { // DEC private modes
        switch (param) {
          case 25: // Show cursor
            this.cursorVisible = true;
            break;
          case 1049: // Enable alternative screen buffer
            this.enableAltScreen();
            break;
        }
      }
    }
  }
  
  resetMode(params, intermediate) {
    for (const param of params) {
      if (intermediate === '?') { // DEC private modes
        switch (param) {
          case 25: // Hide cursor
            this.cursorVisible = false;
            break;
          case 1049: // Disable alternative screen buffer
            this.disableAltScreen();
            break;
        }
      }
    }
  }
  
  // Alternative screen buffer
  enableAltScreen() {
    if (!this.isAltScreen) {
      // Save current buffer and cursor position
      this.altScreenBuffer = {
        buffer: this.buffer.map(row => row.map(cell => ({ ...cell }))),
        cursor: { ...this.cursor }
      };
      this.isAltScreen = true;
      this.clearScreen();
    }
  }
  
  disableAltScreen() {
    if (this.isAltScreen && this.altScreenBuffer) {
      this.buffer = this.altScreenBuffer.buffer;
      this.cursor = this.altScreenBuffer.cursor;
      this.altScreenBuffer = null;
      this.isAltScreen = false;
    }
  }
  
  reset() {
    this.buffer = this.createEmptyBuffer();
    this.cursor = { x: 0, y: 0 };
    this.savedCursor = { x: 0, y: 0 };
    this.scrollRegion = { top: 0, bottom: this.rows - 1 };
    this.currentAttr = { fg: 'white', bg: 'black', bold: false, underline: false, reverse: false };
    this.cursorVisible = true;
    this.isAltScreen = false;
    this.altScreenBuffer = null;
  }
  
  // Output methods
  toString() {
    return this.buffer.map(row => 
      row.map(cell => cell.char).join('')
    ).join('\n');
  }
  
  toStringWithAttributes() {
    // For debugging - shows attributes
    return this.buffer.map(row => 
      row.map(cell => cell.char + (cell.attr.bold ? '*' : '')).join('')
    ).join('\n');
  }
  
  getScreenText() {
    return this.toString();
  }
  
  // Verbose mode utilities
  setVerbose(enabled) {
    this.verbose = enabled;
    if (enabled) {
      console.log('\n🔍 VirtualTerminal VERBOSE MODE ENABLED');
      console.log('Screen dimensions:', this.cols, 'x', this.rows);
      console.log('Initial cursor position:', JSON.stringify(this.cursor));
      console.log('Initial screen:');
      this.logScreen(this.toString());
      console.log('='.repeat(60));
    }
  }
  
  logScreen(screen) {
    const lines = screen.split('\n');
    lines.forEach((line, i) => {
      console.log(`${String(i).padStart(2, '0')}: |${line}|`);
    });
  }
  
  logState() {
    console.log('\n--- TERMINAL STATE ---');
    console.log('Cursor:', JSON.stringify(this.cursor));
    console.log('Scroll Region:', JSON.stringify(this.scrollRegion));
    console.log('Alt Screen:', this.isAltScreen);
    console.log('Frame Counter:', this.frameCounter);
    console.log('Change Listeners:', this.changeListeners.size);
    console.log('Has Changed Since Last Check:', this.hasChangedSinceLastCheck);
    console.log('Current Screen:');
    this.logScreen(this.toString());
    console.log('--- END STATE ---\n');
  }
  
  // Change subscription system
  onScreenChange(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.changeListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(callback);
    };
  }
  
  offScreenChange(callback) {
    this.changeListeners.delete(callback);
  }
  
  notifyChangeListeners(changeData) {
    for (const listener of this.changeListeners) {
      try {
        listener(changeData);
      } catch (error) {
        console.error('Error in change listener:', error);
      }
    }
  }
  
  // Check if screen has changed since last check and reset flag
  hasChangedSinceLastRead() {
    const changed = this.hasChangedSinceLastCheck;
    this.hasChangedSinceLastCheck = false;
    return changed;
  }
  
  // Get current screen content hash for comparison
  getScreenHash() {
    // Simple hash function for screen content
    const screen = this.toString();
    let hash = 0;
    for (let i = 0; i < screen.length; i++) {
      const char = screen.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
  
  // Mark as read to reset change flag
  markAsRead() {
    this.hasChangedSinceLastCheck = false;
    this.lastScreenHash = this.getScreenHash();
  }
  
  getCursorPosition() {
    return { ...this.cursor };
  }
  
  resize(newCols, newRows) {
    const oldBuffer = this.buffer;
    const oldCols = this.cols;
    const oldRows = this.rows;
    
    this.cols = newCols;
    this.rows = newRows;
    this.buffer = this.createEmptyBuffer();
    
    // Copy old content
    const copyRows = Math.min(oldRows, newRows);
    for (let y = 0; y < copyRows; y++) {
      const copyCols = Math.min(oldCols, newCols);
      for (let x = 0; x < copyCols; x++) {
        this.buffer[y][x] = { ...oldBuffer[y][x] };
      }
    }
    
    // Adjust cursor position
    this.cursor.x = Math.min(this.cursor.x, newCols - 1);
    this.cursor.y = Math.min(this.cursor.y, newRows - 1);
    
    // Adjust scroll region
    this.scrollRegion.bottom = Math.min(this.scrollRegion.bottom, newRows - 1);
  }
}

export default VirtualTerminal;