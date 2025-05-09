class Grid {
    constructor(game, rows, cols) {
        this.game = game;
        this.rows = rows;
        this.cols = cols;
        this.tileSize = Math.min(
            game.canvas.width / cols,
            game.canvas.height / rows
        );
        this.tiles = [];
        this.initGrid();
    }

    initGrid() {
        // Initialize empty grid
        this.tiles = Array(this.rows).fill().map(() => Array(this.cols).fill(0));

        // Place solid rocks in a pattern (every other tile)
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (row % 2 === 1 && col % 2 === 1) {
                    this.tiles[row][col] = 2; // Solid rock
                }
            }
        }

        // Add breakable walls randomly (but keep corners clear for players)
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                // Skip solid rocks
                if (this.tiles[row][col] === 2) continue;
                
                // Skip the corners (3x3 areas) for player starting positions
                if ((row < 3 && col < 3) || 
                    (row < 3 && col >= this.cols - 3) || 
                    (row >= this.rows - 3 && col < 3) || 
                    (row >= this.rows - 3 && col >= this.cols - 3)) {
                    continue;
                }
                
                // 70% chance to place a breakable wall
                if (Math.random() < 0.7) {
                    this.tiles[row][col] = 1; // Breakable wall
                }
            }
        }
    }

    getPlayerStartPosition(playerIndex) {
        const positions = [
            { row: 1, col: 1 },               // Top-left
            { row: 1, col: this.cols - 2 },   // Top-right
            { row: this.rows - 2, col: 1 },   // Bottom-left
            { row: this.rows - 2, col: this.cols - 2 } // Bottom-right
        ];
        
        return positions[playerIndex % 4];
    }

    isTileEmpty(row, col) {
        // Check if within bounds
        if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) {
            return false;
        }
        
        // Check if tile is empty (0)
        return this.tiles[row][col] === 0;
    }

    destroyWall(row, col) {
        if (this.tiles[row][col] === 1) { // Breakable wall
            this.tiles[row][col] = 0; // Make it empty
            
            // Chance to spawn a power-up
            if (Math.random() < 0.3) {
                // Types: 
                // 3 = bomb count, 4 = explosion range, 5 = speed
                const powerupType = 3 + Math.floor(Math.random() * 3);
                this.tiles[row][col] = powerupType;
            }
            
            return true;
        }
        return false;
    }

    shrinkMap(corner, step) {
        // Logic for dropping rocks to shrink the map over time
        // corner indicates which corner to start from (0-3)
        // step indicates how far into the shrinking we are
        
        const corners = [
            { startRow: 0, startCol: 0, rowDir: 1, colDir: 1 }, // Top-left corner
            { startRow: 0, startCol: this.cols - 1, rowDir: 1, colDir: -1 }, // Top-right corner
            { startRow: this.rows - 1, startCol: 0, rowDir: -1, colDir: 1 }, // Bottom-left corner
            { startRow: this.rows - 1, startCol: this.cols - 1, rowDir: -1, colDir: -1 } // Bottom-right corner
        ];
        
        const { startRow, startCol, rowDir, colDir } = corners[corner];
        
        // Calculate which ring we're on based on the step
        const ring = Math.floor(step / 4);
        const side = step % 4;
        
        if (ring >= Math.min(this.rows, this.cols) / 2) {
            return false; // Map shrinking is complete
        }
        
        // Determine row and column based on ring and side
        let row, col;
        
        if (side === 0) { // Top edge
            row = startRow + (ring * rowDir);
            col = startCol + (ring * colDir);
            // Move horizontally
            for (let i = 0; i < this.cols - (ring * 2); i++) {
                const c = colDir > 0 ? col + i : col - i;
                if (this.tiles[row][c] !== 2) {
                    this.tiles[row][c] = 2; // Add solid rock
                    return { row, col: c };
                }
            }
        } else if (side === 1) { // Right edge
            row = startRow + (ring * rowDir);
            col = colDir > 0 ? this.cols - 1 - ring : ring;
            // Move vertically
            for (let i = 0; i < this.rows - (ring * 2); i++) {
                const r = rowDir > 0 ? row + i : row - i;
                if (this.tiles[r][col] !== 2) {
                    this.tiles[r][col] = 2; // Add solid rock
                    return { row: r, col };
                }
            }
        } else if (side === 2) { // Bottom edge
            row = rowDir > 0 ? this.rows - 1 - ring : ring;
            col = colDir > 0 ? this.cols - 1 - ring : ring;
            // Move horizontally
            for (let i = 0; i < this.cols - (ring * 2); i++) {
                const c = colDir > 0 ? col - i : col + i;
                if (this.tiles[row][c] !== 2) {
                    this.tiles[row][c] = 2; // Add solid rock
                    return { row, col: c };
                }
            }
        } else if (side === 3) { // Left edge
            row = rowDir > 0 ? this.rows - 1 - ring : ring;
            col = startCol + (ring * colDir);
            // Move vertically
            for (let i = 0; i < this.rows - (ring * 2); i++) {
                const r = rowDir > 0 ? row - i : row + i;
                if (this.tiles[r][col] !== 2) {
                    this.tiles[r][col] = 2; // Add solid rock
                    return { row: r, col };
                }
            }
        }
        
        return null; // No new rocks placed
    }

    draw(ctx) {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const x = col * this.tileSize;
                const y = row * this.tileSize;
                
                // Draw base tile
                ctx.fillStyle = '#4a752c'; // Grass
                ctx.fillRect(x, y, this.tileSize, this.tileSize);
                
                // Draw tile content
                switch (this.tiles[row][col]) {
                    case 1: // Breakable wall (the "eggs")
                        const breakableWallImg = document.getElementById('wall-breakable-img');
                        if (breakableWallImg && breakableWallImg.complete) {
                            ctx.drawImage(breakableWallImg, x, y, this.tileSize, this.tileSize);
                        } else {
                            // Fallback if image not loaded
                            ctx.fillStyle = '#8B4513'; // Brown fallback
                            ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
                        }
                        break;
                    case 2: // Solid rock
                        const solidWallImg = document.getElementById('wall-solid-img');
                        if (solidWallImg && solidWallImg.complete) {
                            ctx.drawImage(solidWallImg, x, y, this.tileSize, this.tileSize);
                        } else {
                            // Fallback if image not loaded
                            ctx.fillStyle = '#555'; // Gray fallback
                            ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
                        }
                        break;
                    case 3: // Bomb power-up
                        const bombPowerupImg = document.getElementById('powerup-bomb-img');
                        if (bombPowerupImg && bombPowerupImg.complete) {
                            ctx.drawImage(bombPowerupImg, x, y, this.tileSize, this.tileSize);
                        } else {
                            // Fallback
                            ctx.fillStyle = 'red';
                            ctx.beginPath();
                            ctx.arc(x + this.tileSize/2, y + this.tileSize/2, this.tileSize/3, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        break;
                    case 4: // Range power-up
                        const rangePowerupImg = document.getElementById('powerup-range-img');
                        if (rangePowerupImg && rangePowerupImg.complete) {
                            ctx.drawImage(rangePowerupImg, x, y, this.tileSize, this.tileSize);
                        } else {
                            // Fallback
                            ctx.fillStyle = 'yellow';
                            ctx.beginPath();
                            ctx.arc(x + this.tileSize/2, y + this.tileSize/2, this.tileSize/3, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        break;
                    case 5: // Speed power-up
                        const speedPowerupImg = document.getElementById('powerup-speed-img');
                        if (speedPowerupImg && speedPowerupImg.complete) {
                            ctx.drawImage(speedPowerupImg, x, y, this.tileSize, this.tileSize);
                        } else {
                            // Fallback
                            ctx.fillStyle = 'green';
                            ctx.beginPath();
                            ctx.arc(x + this.tileSize/2, y + this.tileSize/2, this.tileSize/3, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        break;
                }
                
                // Draw grid lines
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, this.tileSize, this.tileSize);
            }
        }
    }
}

// Improved helper function to create and cache images
function createImageFromPath(path) {
    const img = new Image();
    img.src = path;
    const idName = path.substring(1).split('.')[0].replace(/\//g, '-') + '-img';
    img.id = idName;
    
    // Only add to body if it doesn't exist already
    if (!document.getElementById(idName)) {
        document.body.appendChild(img);
        img.style.display = 'none';
    }
    
    return img;
}