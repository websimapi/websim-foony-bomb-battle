class Player {
    constructor(game, id, username, avatarUrl, playerIndex) {
        this.game = game;
        this.id = id;
        this.username = username;
        this.avatarUrl = avatarUrl;
        this.playerIndex = playerIndex;
        
        // Starting position based on player index
        const startPos = game.grid.getPlayerStartPosition(playerIndex);
        this.row = startPos.row;
        this.col = startPos.col;
        
        // Convert to pixel position for smooth movement
        this.x = this.col * game.grid.tileSize;
        this.y = this.row * game.grid.tileSize;
        
        // Movement
        this.targetX = this.x;
        this.targetY = this.y;
        this.speed = 3;
        this.isMoving = false;
        this.direction = 'down';
        this.moving = false;
        
        // Gameplay stats
        this.bombs = 1; // Start with 1 bomb
        this.maxBombs = 1;
        this.bombRange = 1;
        this.alive = true;
        this.bubble = false;
        this.bubbleTimer = 0;
        
        // Colors for different players
        this.colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
        this.color = this.colors[playerIndex % this.colors.length];
        
        // Input handling
        this.keys = {};
        
        // Only set up controls for the local player
        if (id === game.room.clientId) {
            window.addEventListener('keydown', this.handleKeyDown.bind(this));
            window.addEventListener('keyup', this.handleKeyUp.bind(this));
        }
    }
    
    handleKeyDown(e) {
        this.keys[e.key] = true;
        
        // Place bomb with space
        if (e.key === ' ' && !this.bubble && this.alive) {
            this.placeBomb();
        }
    }
    
    handleKeyUp(e) {
        this.keys[e.key] = false;
    }
    
    placeBomb() {
        // Check if player can place more bombs
        const activeBombs = Object.values(this.game.bombs).filter(
            bomb => bomb.playerId === this.id && !bomb.exploded
        ).length;
        
        if (activeBombs >= this.maxBombs) return;
        
        // Get the tile position
        const tileRow = Math.round(this.y / this.game.grid.tileSize);
        const tileCol = Math.round(this.x / this.game.grid.tileSize);
        
        // Check if there's already a bomb at this position
        if (Object.values(this.game.bombs).some(
            bomb => bomb.row === tileRow && bomb.col === tileCol && !bomb.exploded
        )) return;
        
        // Place bomb
        const bombId = `bomb-${Date.now()}-${this.id}`;
        const bomb = {
            id: bombId,
            playerId: this.id,
            row: tileRow,
            col: tileCol,
            range: this.bombRange,
            timer: 3000, // 3 seconds
            exploded: false
        };
        
        // Update room state with the new bomb
        const bombUpdate = {};
        bombUpdate[bombId] = bomb;
        
        this.game.room.updateRoomState({
            bombs: bombUpdate
        });
    }
    
    update(deltaTime) {
        if (this.bubble) {
            // Update bubble timer
            this.bubbleTimer -= deltaTime;
            if (this.bubbleTimer <= 0) {
                this.bubble = false;
                
                // If this is the local player, update presence
                if (this.id === this.game.room.clientId) {
                    this.game.room.updatePresence({
                        bubble: false
                    });
                }
            }
            return;
        }
        
        if (!this.alive) return;
        
        // Only handle input for the local player
        if (this.id === this.game.room.clientId) {
            this.handleMovement(deltaTime);
        }
        
        // Smooth movement to target position
        if (this.x !== this.targetX || this.y !== this.targetY) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.speed) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.moving = false;
                
                // Check for powerups when reaching a new tile
                this.checkPowerups();
            } else {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
                this.moving = true;
            }
        }
    }
    
    checkPowerups() {
        const tileRow = Math.round(this.y / this.game.grid.tileSize);
        const tileCol = Math.round(this.x / this.game.grid.tileSize);
        
        // Only process if we're the local player
        if (this.id === this.game.room.clientId) {
            const tile = this.game.grid.tiles[tileRow][tileCol];
            
            if (tile >= 3 && tile <= 5) { // Power-up tiles
                // Apply power-up
                switch (tile) {
                    case 3: // Bomb count
                        this.maxBombs++;
                        break;
                    case 4: // Explosion range
                        this.bombRange++;
                        break;
                    case 5: // Speed
                        this.speed += 0.5;
                        break;
                }
                
                // Update presence with new stats
                this.game.room.updatePresence({
                    maxBombs: this.maxBombs,
                    bombRange: this.bombRange,
                    speed: this.speed
                });
                
                // Clear the tile in the room state
                const tileUpdate = {};
                const tileKey = `${tileRow}-${tileCol}`;
                tileUpdate[tileKey] = 0;
                
                this.game.room.updateRoomState({
                    tileUpdates: tileUpdate
                });
            }
            
            // Check if we're on another player's bubble
            for (const playerId in this.game.players) {
                const player = this.game.players[playerId];
                if (player.id !== this.id && player.bubble) {
                    const playerTileRow = Math.round(player.y / this.game.grid.tileSize);
                    const playerTileCol = Math.round(player.x / this.game.grid.tileSize);
                    
                    if (tileRow === playerTileRow && tileCol === playerTileCol) {
                        // Kill the bubbled player
                        this.game.room.requestPresenceUpdate(player.id, {
                            type: 'killBubble'
                        });
                    }
                }
            }
        }
    }
    
    handleMovement(deltaTime) {
        // Don't allow new movement input if currently moving between tiles
        if (this.moving) return;
        
        // Calculate potential new position
        let newRow = this.row;
        let newCol = this.col;
        let moved = false;
        let direction = this.direction;
        
        if (this.keys['ArrowUp'] || this.keys['w']) {
            newRow--;
            direction = 'up';
            moved = true;
        } else if (this.keys['ArrowDown'] || this.keys['s']) {
            newRow++;
            direction = 'down';
            moved = true;
        } else if (this.keys['ArrowLeft'] || this.keys['a']) {
            newCol--;
            direction = 'left';
            moved = true;
        } else if (this.keys['ArrowRight'] || this.keys['d']) {
            newCol++;
            direction = 'right';
            moved = true;
        }
        
        if (moved && this.game.grid.isTileEmpty(newRow, newCol)) {
            // Move to the new tile
            this.row = newRow;
            this.col = newCol;
            this.targetX = this.col * this.game.grid.tileSize;
            this.targetY = this.row * this.game.grid.tileSize;
            this.direction = direction;
            this.moving = true;
            
            // Update presence
            this.game.room.updatePresence({
                x: this.x,
                y: this.y,
                targetX: this.targetX,
                targetY: this.targetY,
                row: this.row,
                col: this.col,
                direction: this.direction,
                moving: this.moving
            });
        }
    }
    
    hit() {
        if (this.bubble || !this.alive) return;
        
        // Turn into bubble
        this.bubble = true;
        this.bubbleTimer = 3000; // 3 seconds
        
        // If this is the local player, update presence
        if (this.id === this.game.room.clientId) {
            this.game.room.updatePresence({
                bubble: true,
                bubbleTimer: this.bubbleTimer
            });
        }
    }
    
    kill() {
        this.alive = false;
        this.bubble = false;
        
        // If this is the local player, update presence
        if (this.id === this.game.room.clientId) {
            this.game.room.updatePresence({
                alive: false,
                bubble: false
            });
        }
    }
    
    draw(ctx) {
        const x = this.x + this.game.grid.tileSize / 2;
        const y = this.y + this.game.grid.tileSize / 2;
        const radius = this.game.grid.tileSize * 0.4;
        
        if (!this.alive) return;
        
        if (this.bubble) {
            // Draw bubble
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200, 200, 255, 0.7)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw countdown
            const countdown = Math.ceil(this.bubbleTimer / 1000);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(countdown.toString(), x, y);
        } else {
            // Draw player
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw player name
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this.username, x, y - radius - 5);
        }
    }
}

