class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        // Game state
        this.players = {};
        this.bombs = {};
        this.grid = null;
        this.gameStarted = false;
        this.gameOver = false;
        this.winner = null;
        this.timeElapsed = 0;
        this.shrinkTimer = 0;
        this.shrinkStep = 0;
        this.shrinkCorner = 0;
        
        // Initialize WebsimSocket
        this.room = new WebsimSocket();
        
        // Timing variables
        this.lastTime = 0;
        
        // Initialize the game
        this.init();
        
        // Start the game loop
        window.requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    async init() {
        await this.room.initialize();
        
        // Subscribe to presence changes
        this.room.subscribePresence(this.handlePresenceUpdate.bind(this));
        
        // Subscribe to room state changes
        this.room.subscribeRoomState(this.handleRoomStateUpdate.bind(this));
        
        // Subscribe to presence update requests
        this.room.subscribePresenceUpdateRequests(this.handlePresenceUpdateRequest.bind(this));
        
        // Setup event handling
        this.room.onmessage = this.handleMessage.bind(this);
        
        // Listen for window resize
        window.addEventListener('resize', this.resizeCanvas.bind(this));
    }
    
    resizeCanvas() {
        const container = document.getElementById('game-container');
        const size = Math.min(container.clientWidth, container.clientHeight);
        this.canvas.width = size;
        this.canvas.height = size;
        
        // Redraw grid if it exists
        if (this.grid) {
            this.grid.tileSize = Math.min(
                this.canvas.width / this.grid.cols,
                this.canvas.height / this.grid.rows
            );
        }
    }
    
    startGame(hostId) {
        if (this.gameStarted) return;
        
        console.log("Starting game as host:", this.room.clientId === hostId);
        
        // Create the grid
        this.grid = new Grid(this, 15, 15);
        
        // Initialize players
        let playerIndex = 0;
        for (const clientId in this.room.presence) {
            const playerData = this.room.presence[clientId];
            
            if (playerData.ready || (clientId === hostId)) {
                // Include the host even if not marked as ready
                const playerInfo = this.room.peers[clientId];
                
                this.players[clientId] = new Player(
                    this,
                    clientId,
                    playerInfo.username,
                    playerInfo.avatarUrl,
                    playerIndex
                );
                
                // If this is the local player, update our initial position
                if (clientId === this.room.clientId) {
                    const startPos = this.grid.getPlayerStartPosition(playerIndex);
                    this.room.updatePresence({
                        x: startPos.col * this.grid.tileSize,
                        y: startPos.row * this.grid.tileSize,
                        row: startPos.row,
                        col: startPos.col,
                        targetX: startPos.col * this.grid.tileSize,
                        targetY: startPos.row * this.grid.tileSize,
                        direction: 'down',
                        moving: false,
                        alive: true,
                        bubble: false,
                        maxBombs: 1,
                        bombRange: 1,
                        speed: 3
                    });
                }
                
                playerIndex++;
            }
        }
        
        // Update game state
        this.gameStarted = true;
        this.gameOver = false;
        this.timeElapsed = 0;
        this.shrinkTimer = 0;
        this.shrinkStep = 0;
        this.shrinkCorner = 0;
        
        // Show game screen
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('active');
        
        // If we're the host, update the room state with the grid
        if (this.room.clientId === hostId) {
            // Convert grid to room state format
            const gridState = {};
            for (let row = 0; row < this.grid.rows; row++) {
                for (let col = 0; col < this.grid.cols; col++) {
                    const key = `${row}-${col}`;
                    gridState[key] = this.grid.tiles[row][col];
                }
            }
            
            this.room.updateRoomState({
                gameStarted: true,
                grid: gridState,
                bombs: {},
                shrinkStep: 0,
                shrinkCorner: 0,
                timeElapsed: 0
            });
        }
        
        console.log("Game started successfully");
    }
    
    handlePresenceUpdate(presence) {
        // Create/update players based on presence
        for (const clientId in presence) {
            const playerData = presence[clientId];
            
            if (!this.gameStarted) continue;
            
            if (clientId in this.players) {
                // Update existing player with presence data
                const player = this.players[clientId];
                
                if ('x' in playerData) player.x = playerData.x;
                if ('y' in playerData) player.y = playerData.y;
                if ('targetX' in playerData) player.targetX = playerData.targetX;
                if ('targetY' in playerData) player.targetY = playerData.targetY;
                if ('row' in playerData) player.row = playerData.row;
                if ('col' in playerData) player.col = playerData.col;
                if ('direction' in playerData) player.direction = playerData.direction;
                if ('moving' in playerData) player.moving = playerData.moving;
                if ('maxBombs' in playerData) player.maxBombs = playerData.maxBombs;
                if ('bombRange' in playerData) player.bombRange = playerData.bombRange;
                if ('speed' in playerData) player.speed = playerData.speed;
                if ('alive' in playerData) player.alive = playerData.alive;
                if ('bubble' in playerData) {
                    player.bubble = playerData.bubble;
                    if ('bubbleTimer' in playerData) {
                        player.bubbleTimer = playerData.bubbleTimer;
                    }
                }
            }
        }
        
        // Check if game is over
        this.checkGameOver();
    }
    
    handleRoomStateUpdate(roomState) {
        // If game just started, initialize the game
        if (roomState.gameStarted && !this.gameStarted) {
            // Show game screen
            document.getElementById('lobby-screen').classList.remove('active');
            document.getElementById('lobby-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
            document.getElementById('game-screen').classList.add('active');
            
            // Create the grid based on room state
            this.grid = new Grid(this, 15, 15);
            
            // Set the grid tiles from the room state
            if (roomState.grid) {
                for (const key in roomState.grid) {
                    const [row, col] = key.split('-').map(Number);
                    this.grid.tiles[row][col] = roomState.grid[key];
                }
            }
            
            // Initialize players
            let playerIndex = 0;
            for (const clientId in this.room.presence) {
                const playerData = this.room.presence[clientId];
                
                if (playerData.ready) {
                    const playerInfo = this.room.peers[clientId];
                    
                    this.players[clientId] = new Player(
                        this,
                        clientId,
                        playerInfo.username,
                        playerInfo.avatarUrl,
                        playerIndex
                    );
                    
                    // Apply presence data
                    if (clientId in this.room.presence) {
                        const presenceData = this.room.presence[clientId];
                        
                        if ('x' in presenceData) this.players[clientId].x = presenceData.x;
                        if ('y' in presenceData) this.players[clientId].y = presenceData.y;
                        if ('targetX' in presenceData) this.players[clientId].targetX = presenceData.targetX;
                        if ('targetY' in presenceData) this.players[clientId].targetY = presenceData.targetY;
                        if ('row' in presenceData) this.players[clientId].row = presenceData.row;
                        if ('col' in presenceData) this.players[clientId].col = presenceData.col;
                        if ('direction' in presenceData) this.players[clientId].direction = presenceData.direction;
                        if ('moving' in presenceData) this.players[clientId].moving = presenceData.moving;
                        if ('maxBombs' in presenceData) this.players[clientId].maxBombs = presenceData.maxBombs;
                        if ('bombRange' in presenceData) this.players[clientId].bombRange = presenceData.bombRange;
                        if ('speed' in presenceData) this.players[clientId].speed = presenceData.speed;
                        if ('alive' in presenceData) this.players[clientId].alive = presenceData.alive;
                        if ('bubble' in presenceData) {
                            this.players[clientId].bubble = presenceData.bubble;
                            if ('bubbleTimer' in presenceData) {
                                this.players[clientId].bubbleTimer = presenceData.bubbleTimer;
                            }
                        }
                    }
                    
                    playerIndex++;
                }
            }
            
            this.gameStarted = true;
        }
        
        // Update bombs
        if (roomState.bombs) {
            // Add/update bombs
            for (const bombId in roomState.bombs) {
                if (roomState.bombs[bombId] === null) {
                    // Remove bomb
                    delete this.bombs[bombId];
                } else {
                    // Add/update bomb
                    this.bombs[bombId] = roomState.bombs[bombId];
                }
            }
        }
        
        // Update tile changes
        if (roomState.tileUpdates) {
            for (const key in roomState.tileUpdates) {
                const [row, col] = key.split('-').map(Number);
                this.grid.tiles[row][col] = roomState.tileUpdates[key];
            }
        }
        
        // Update shrink state
        if ('shrinkStep' in roomState) this.shrinkStep = roomState.shrinkStep;
        if ('shrinkCorner' in roomState) this.shrinkCorner = roomState.shrinkCorner;
        if ('timeElapsed' in roomState) this.timeElapsed = roomState.timeElapsed;
    }
    
    handlePresenceUpdateRequest(updateRequest, fromClientId) {
        // Handle presence update requests
        if (updateRequest.type === 'killBubble') {
            // If we're in a bubble, we get killed permanently
            if (this.players[this.room.clientId].bubble) {
                this.players[this.room.clientId].kill();
            }
        }
    }
    
    handleMessage(event) {
        const data = event.data;
        console.log("Received message:", data.type);
        
        switch (data.type) {
            case 'startGame':
                console.log("Starting game with host:", data.hostId);
                this.startGame(data.hostId);
                break;
            case 'explosion':
                // Add visual/audio effects for explosion
                this.createExplosionEffect(data.row, data.col, data.size);
                break;
            case 'rockFall':
                // Add visual/audio effects for rock falling
                this.createRockFallEffect(data.row, data.col);
                break;
        }
    }
    
    createExplosionEffect(row, col, size) {
        // Create center explosion
        this.createExplosionTileEffect(row, col, 'center');
        
        // Create explosion in four directions
        const directions = [
            { dr: -1, dc: 0, name: 'up' }, // Up
            { dr: 1, dc: 0, name: 'down' },  // Down
            { dr: 0, dc: -1, name: 'left' }, // Left
            { dr: 0, dc: 1, name: 'right' }   // Right
        ];
        
        for (const dir of directions) {
            let blocked = false;
            for (let i = 1; i <= size; i++) {
                if (blocked) break;
                
                const newRow = row + dir.dr * i;
                const newCol = col + dir.dc * i;
                
                // Check if out of bounds
                if (newRow < 0 || newRow >= this.grid.rows || newCol < 0 || newCol >= this.grid.cols) {
                    break;
                }
                
                // Check tile type
                const tile = this.grid.tiles[newRow][newCol];
                
                if (tile === 2) { // Solid rock - stop explosion
                    break;
                } else if (tile === 1) { // Breakable wall - show explosion here but stop
                    this.createExplosionTileEffect(newRow, newCol, i === size ? 'end' : 'middle', dir.name);
                    blocked = true; // Stop after this tile
                } else {
                    // Empty space or power-up
                    const position = i === size ? 'end' : 'middle';
                    this.createExplosionTileEffect(newRow, newCol, position, dir.name);
                }
            }
        }
        
        // Play explosion sound
        const explosionSound = new Audio('/bomb_explosion.mp3');
        explosionSound.volume = 0.4;
        explosionSound.play();
    }

    createExplosionTileEffect(row, col, position, direction = null) {
        const x = col * this.grid.tileSize;
        const y = row * this.grid.tileSize;
        const size = this.grid.tileSize;
        
        // Create explosion tile element
        const explosionTile = document.createElement('div');
        explosionTile.className = 'explosion-tile';
        explosionTile.style.position = 'absolute';
        explosionTile.style.left = `${x}px`;
        explosionTile.style.top = `${y}px`;
        explosionTile.style.width = `${size}px`;
        explosionTile.style.height = `${size}px`;
        
        // Style based on position in explosion
        if (position === 'center') {
            explosionTile.style.backgroundColor = '#ff6600';
            explosionTile.style.borderRadius = '50%';
        } else {
            explosionTile.style.backgroundColor = '#ff9900';
            
            // Apply styles based on direction
            if (direction === 'up' || direction === 'down') {
                explosionTile.style.borderRadius = '20%';
            } else if (direction === 'left' || direction === 'right') {
                explosionTile.style.borderRadius = '20%';
            }
        }
        
        explosionTile.style.opacity = '0.8';
        explosionTile.style.zIndex = '5';
        explosionTile.style.boxSizing = 'border-box';
        explosionTile.style.border = '2px solid #ff3300';
        
        document.getElementById('game-screen').appendChild(explosionTile);
        
        // Animation sequence: fade in, hold, fade out
        explosionTile.animate([
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: 0.8, transform: 'scale(1.1)' },
            { opacity: 0.8, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(0.8)' }
        ], {
            duration: 800,
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
            fill: 'forwards'
        });
        
        // Remove element after animation
        setTimeout(() => {
            explosionTile.remove();
        }, 800);
    }
    
    createRockFallEffect(row, col) {
        const x = col * this.grid.tileSize;
        const y = row * this.grid.tileSize;
        const size = this.grid.tileSize;
        
        // Create visual effect
        const rockFallEffect = document.createElement('div');
        rockFallEffect.className = 'rock-fall-effect';
        rockFallEffect.style.position = 'absolute';
        rockFallEffect.style.left = `${x}px`;
        rockFallEffect.style.top = `${y}px`;
        rockFallEffect.style.width = `${size}px`;
        rockFallEffect.style.height = `${size}px`;
        rockFallEffect.style.backgroundColor = '#777';
        rockFallEffect.style.zIndex = '5';
        rockFallEffect.style.boxSizing = 'border-box';
        rockFallEffect.style.border = '2px solid #555';
        
        document.getElementById('game-screen').appendChild(rockFallEffect);
        
        // Animation for rock falling
        rockFallEffect.animate([
            { opacity: 0, transform: 'translateY(-50px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], {
            duration: 500,
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
            fill: 'forwards'
        });
        
        // Play rock fall sound
        const rockFallSound = new Audio('/rock_fall.mp3');
        rockFallSound.volume = 0.4;
        rockFallSound.play();
        
        // Remove effect element after animation
        setTimeout(() => {
            rockFallEffect.remove();
        }, 500);
    }

    createExplosion(centerRow, centerCol, range) {
        // Center explosion
        this.processExplosionTile(centerRow, centerCol);
        
        // Explosion in four directions
        const directions = [
            { dr: -1, dc: 0 }, // Up
            { dr: 1, dc: 0 },  // Down
            { dr: 0, dc: -1 }, // Left
            { dr: 0, dc: 1 }   // Right
        ];
        
        for (const dir of directions) {
            let blocked = false;
            for (let i = 1; i <= range; i++) {
                if (blocked) break;
                
                const row = centerRow + dir.dr * i;
                const col = centerCol + dir.dc * i;
                
                // Check if out of bounds
                if (row < 0 || row >= this.grid.rows || col < 0 || col >= this.grid.cols) {
                    break;
                }
                
                // Check tile type
                const tile = this.grid.tiles[row][col];
                
                if (tile === 2) { // Solid rock - stop explosion in this direction
                    break;
                } else if (tile === 1) { // Breakable wall - destroy and stop
                    if (this.grid.destroyWall(row, col)) {
                        // Update room state with the destroyed wall
                        const tileUpdate = {};
                        const tileKey = `${row}-${col}`;
                        tileUpdate[tileKey] = this.grid.tiles[row][col];
                        
                        this.room.updateRoomState({
                            tileUpdates: tileUpdate
                        });
                    }
                    
                    // Process explosion on this tile before stopping
                    this.processExplosionTile(row, col);
                    blocked = true; // Stop after this tile
                } else {
                    // Empty space or power-up - process explosion
                    this.processExplosionTile(row, col);
                }
            }
        }
    }
    
    processExplosionTile(row, col) {
        // Check for players on this tile
        for (const playerId in this.players) {
            const player = this.players[playerId];
            
            if (player.alive) {
                const playerRow = Math.round(player.y / this.grid.tileSize);
                const playerCol = Math.round(player.x / this.grid.tileSize);
                
                if (playerRow === row && playerCol === col) {
                    player.hit();
                }
            }
        }
    }
    
    shrinkMap() {
        if (this.room.clientId === Object.keys(this.players)[0]) { // Only host updates the map
            const result = this.grid.shrinkMap(this.shrinkCorner, this.shrinkStep);
            
            if (result) {
                // Broadcast rock fall event
                this.room.send({
                    type: 'rockFall',
                    row: result.row,
                    col: result.col
                });
                
                // Update room state with the new rock
                const tileUpdate = {};
                const tileKey = `${result.row}-${result.col}`;
                tileUpdate[tileKey] = 2; // Solid rock
                
                this.shrinkStep++;
                if (this.shrinkStep % 4 === 0) {
                    this.shrinkCorner = (this.shrinkCorner + 1) % 4;
                }
                
                this.room.updateRoomState({
                    tileUpdates: tileUpdate,
                    shrinkStep: this.shrinkStep,
                    shrinkCorner: this.shrinkCorner
                });
            }
        }
    }
    
    checkGameOver() {
        // Count alive players
        const alivePlayers = Object.values(this.players).filter(p => p.alive);
        
        if (this.gameStarted && !this.gameOver && (alivePlayers.length <= 1 && Object.keys(this.players).length > 1)) {
            this.gameOver = true;
            
            if (alivePlayers.length === 1) {
                this.winner = alivePlayers[0];
            }
            
            // Show game over screen
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('hidden');
            document.getElementById('game-over-screen').classList.remove('hidden');
            document.getElementById('game-over-screen').classList.add('active');
            
            // Display winner
            const winnerDisplay = document.getElementById('winner-display');
            if (this.winner) {
                winnerDisplay.textContent = `Winner: ${this.winner.username}!`;
            } else {
                winnerDisplay.textContent = `No winner! Everyone died!`;
            }
        }
    }
    
    gameLoop(timestamp) {
        // Calculate delta time
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update game state if the game is running
        if (this.gameStarted && !this.gameOver) {
            this.update(deltaTime);
        }
        
        // Draw the game
        this.draw();
        
        // Request next frame
        window.requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    update(deltaTime) {
        // Update time elapsed
        this.timeElapsed += deltaTime;
        
        // Update player stats display
        const localPlayer = this.players[this.room.clientId];
        if (localPlayer) {
            document.getElementById('player-bombs').textContent = `Bombs: ${localPlayer.maxBombs}`;
            document.getElementById('player-range').textContent = `Range: ${localPlayer.bombRange}`;
            document.getElementById('player-speed').textContent = `Speed: ${Math.floor((localPlayer.speed - 3) * 2) + 1}`;
        }
        
        // Update timer display
        const minutes = Math.floor(this.timeElapsed / 60000);
        const seconds = Math.floor((this.timeElapsed % 60000) / 1000);
        document.getElementById('timer').textContent = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Update players alive count
        const playersAlive = Object.values(this.players).filter(p => p.alive).length;
        document.getElementById('players-alive').textContent = `Players: ${playersAlive}/${Object.keys(this.players).length}`;
        
        // Update players
        for (const playerId in this.players) {
            this.players[playerId].update(deltaTime);
        }
        
        // Update bombs
        for (const bombId in this.bombs) {
            const bomb = this.bombs[bombId];
            
            if (!bomb.exploded) {
                bomb.timer -= deltaTime;
                
                if (bomb.timer <= 0) {
                    this.explodeBomb(bombId);
                }
            }
        }
        
        // Handle map shrinking
        this.shrinkTimer += deltaTime;
        if (this.shrinkTimer >= 20000) { // Every 20 seconds
            this.shrinkTimer = 0;
            this.shrinkMap();
        }
        
        // Check for game over
        this.checkGameOver();
    }
    
    explodeBomb(bombId) {
        const bomb = this.bombs[bombId];
        if (!bomb || bomb.exploded) return;
        
        // Mark as exploded
        bomb.exploded = true;
        
        // Update bomb in room state
        const bombUpdate = {};
        bombUpdate[bombId] = {
            ...bomb,
            exploded: true
        };
        
        this.room.updateRoomState({
            bombs: bombUpdate
        });
        
        // Create explosion at bomb location
        this.createExplosion(bomb.row, bomb.col, bomb.range);
        
        // Broadcast explosion event
        this.room.send({
            type: 'explosion',
            row: bomb.row,
            col: bomb.col,
            size: bomb.range
        });
        
        // Remove bomb after a delay
        setTimeout(() => {
            // Remove bomb from room state
            const bombRemove = {};
            bombRemove[bombId] = null;
            
            this.room.updateRoomState({
                bombs: bombRemove
            });
        }, 1000);
    }
    
    draw() {
        // Draw the grid
        if (this.grid) {
            this.grid.draw(this.ctx);
        }
        
        // Draw bombs
        for (const bombId in this.bombs) {
            const bomb = this.bombs[bombId];
            
            if (!bomb.exploded) {
                const x = bomb.col * this.grid.tileSize + this.grid.tileSize / 2;
                const y = bomb.row * this.grid.tileSize + this.grid.tileSize / 2;
                const radius = this.grid.tileSize * 0.3;
                
                // Draw bomb
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, Math.PI * 2);
                this.ctx.fillStyle = 'black';
                this.ctx.fill();
                
                // Draw fuse
                this.ctx.beginPath();
                this.ctx.moveTo(x, y - radius);
                this.ctx.lineTo(x, y - radius - 5);
                this.ctx.strokeStyle = 'gray';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                
                // Draw timer
                const timerPercentage = bomb.timer / 3000;
                if (timerPercentage < 0.5) {
                    this.ctx.fillStyle = timerPercentage < 0.25 ? 'red' : 'orange';
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
        
        // Draw players
        const sortedPlayers = Object.values(this.players).sort((a, b) => a.y - b.y);
        for (const player of sortedPlayers) {
            player.draw(this.ctx);
        }
    }
}

// Create game instance when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window.game = game; // Make game accessible globally
});