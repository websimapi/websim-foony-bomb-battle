class Lobby {
    constructor() {
        this.room = null;
        this.game = null;
        this.lobbyId = null;
        this.isHost = false;
        
        // Cache DOM elements
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.lobbyList = document.getElementById('lobby-list');
        this.lobbiesUl = document.getElementById('lobbies');
        this.lobbyRoom = document.getElementById('lobby-room');
        this.lobbyIdSpan = document.getElementById('lobby-id');
        this.playersList = document.getElementById('players-list');
        this.startGameBtn = document.getElementById('start-game-btn');
        this.returnLobbyBtn = document.getElementById('return-lobby-btn');
        
        // Initialize the lobby
        this.init();
    }
    
    async init() {
        // Wait for the game to initialize
        while (!window.game || !window.game.room) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.game = window.game;
        this.room = this.game.room;
        
        // Set up event listeners
        document.getElementById('create-lobby-btn').addEventListener('click', this.createLobby.bind(this));
        document.getElementById('join-lobby-btn').addEventListener('click', this.showLobbyList.bind(this));
        document.getElementById('refresh-lobbies-btn').addEventListener('click', this.refreshLobbies.bind(this));
        document.getElementById('back-btn').addEventListener('click', this.showMainLobby.bind(this));
        document.getElementById('ready-btn').addEventListener('click', this.toggleReady.bind(this));
        document.getElementById('leave-lobby-btn').addEventListener('click', this.leaveLobby.bind(this));
        document.getElementById('start-game-btn').addEventListener('click', this.startGame.bind(this));
        this.returnLobbyBtn.addEventListener('click', this.returnToLobby.bind(this));
        
        // Listen for presence updates to update the lobby UI
        this.room.subscribePresence(this.updateLobbyUI.bind(this));
        
        // Handle messages for lobby management
        const originalOnMessage = this.room.onmessage;
        this.room.onmessage = (event) => {
            const data = event.data;
            
            switch (data.type) {
                case 'lobbyCreated':
                    this.joinLobby(data.lobbyId);
                    break;
                case 'lobbyList':
                    this.displayLobbies(data.lobbies);
                    break;
                default:
                    // Call the original handler
                    if (originalOnMessage) {
                        originalOnMessage(event);
                    }
            }
        };
        
        // Set initial presence
        this.room.updatePresence({
            inLobby: false,
            lobbyId: null,
            ready: false,
            isHost: false
        });
    }
    
    createLobby() {
        const lobbyId = `lobby-${Date.now()}-${this.room.clientId.substring(0, 6)}`;
        
        // Update presence to indicate we're the host
        this.room.updatePresence({
            inLobby: true,
            lobbyId: lobbyId,
            ready: false,
            isHost: true
        });
        
        // Broadcast lobby creation to others
        this.room.send({
            type: 'lobbyCreated',
            lobbyId: lobbyId
        });
        
        // Join the lobby
        this.joinLobby(lobbyId, true);
    }
    
    joinLobby(lobbyId, isHost = false) {
        this.lobbyId = lobbyId;
        this.isHost = isHost;
        
        // Update presence
        this.room.updatePresence({
            inLobby: true,
            lobbyId: lobbyId,
            ready: false,
            isHost: isHost
        });
        
        // Show lobby room UI
        this.lobbyIdSpan.textContent = lobbyId;
        this.lobbyList.classList.add('hidden');
        this.lobbyRoom.classList.remove('hidden');
        
        // Update visibility of start game button
        this.startGameBtn.classList.toggle('hidden', !isHost);
        
        // Initialize player list
        this.updateLobbyUI();
    }
    
    showLobbyList() {
        // Request lobby list
        this.refreshLobbies();
        
        // Show lobby list UI
        document.querySelector('.lobby-actions').classList.add('hidden');
        this.lobbyList.classList.remove('hidden');
    }
    
    refreshLobbies() {
        // Request lobby list from other clients
        this.room.send({
            type: 'requestLobbyList'
        });
        
        // Clear current list
        this.lobbiesUl.innerHTML = '';
        
        // Add lobbies from presence data
        const lobbies = {};
        
        for (const clientId in this.room.presence) {
            const playerData = this.room.presence[clientId];
            
            if (playerData.inLobby && playerData.lobbyId && playerData.isHost) {
                const lobbyId = playerData.lobbyId;
                
                if (!lobbies[lobbyId]) {
                    lobbies[lobbyId] = {
                        id: lobbyId,
                        hostId: clientId,
                        hostName: this.room.peers[clientId]?.username || 'Unknown',
                        players: 1
                    };
                }
            } else if (playerData.inLobby && playerData.lobbyId) {
                const lobbyId = playerData.lobbyId;
                
                if (lobbies[lobbyId]) {
                    lobbies[lobbyId].players++;
                }
            }
        }
        
        this.displayLobbies(Object.values(lobbies));
    }
    
    displayLobbies(lobbies) {
        // Clear current list
        this.lobbiesUl.innerHTML = '';
        
        if (lobbies.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No lobbies available. Create one!';
            this.lobbiesUl.appendChild(li);
            return;
        }
        
        for (const lobby of lobbies) {
            const li = document.createElement('li');
            li.textContent = `${lobby.hostName}'s Lobby (${lobby.players}/4)`;
            li.dataset.lobbyId = lobby.id;
            
            // Don't allow joining full lobbies
            if (lobby.players < 4) {
                li.addEventListener('click', () => {
                    this.joinLobby(lobby.id);
                });
            } else {
                li.classList.add('full');
                li.textContent += ' [FULL]';
            }
            
            this.lobbiesUl.appendChild(li);
        }
    }
    
    showMainLobby() {
        document.querySelector('.lobby-actions').classList.remove('hidden');
        this.lobbyList.classList.add('hidden');
        this.lobbyRoom.classList.add('hidden');
    }
    
    toggleReady() {
        const currentPresence = this.room.presence[this.room.clientId];
        const ready = !currentPresence.ready;
        
        // Update presence
        this.room.updatePresence({
            ready: ready
        });
        
        // Update UI
        document.getElementById('ready-btn').textContent = ready ? 'Not Ready' : 'Ready';
    }
    
    leaveLobby() {
        // Update presence
        this.room.updatePresence({
            inLobby: false,
            lobbyId: null,
            ready: false,
            isHost: false
        });
        
        // Reset lobby data
        this.lobbyId = null;
        this.isHost = false;
        
        // Show main lobby UI
        this.showMainLobby();
    }
    
    startGame() {
        if (!this.isHost) return;
        
        // Check if we have at least 2 players
        let playerCount = 0;
        let allReady = true;
        
        for (const clientId in this.room.presence) {
            const playerData = this.room.presence[clientId];
            
            if (playerData.inLobby && playerData.lobbyId === this.lobbyId) {
                playerCount++;
                
                if (!playerData.ready && clientId !== this.room.clientId) {
                    allReady = false;
                }
            }
        }
        
        if (playerCount < 2) {
            alert('Need at least 2 players to start!');
            return;
        }
        
        if (!allReady) {
            alert('All players must be ready to start!');
            return;
        }
        
        // Broadcast game start
        this.room.send({
            type: 'startGame',
            hostId: this.room.clientId
        });
    }
    
    returnToLobby() {
        // Reset game state
        this.game.gameStarted = false;
        this.game.gameOver = false;
        
        // Update presence
        this.room.updatePresence({
            inLobby: true,
            lobbyId: this.lobbyId,
            ready: false
        });
        
        // Show lobby UI
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        document.getElementById('lobby-screen').classList.add('active');
        this.lobbyRoom.classList.remove('hidden');
        
        // Update lobby UI
        this.updateLobbyUI();
    }
    
    updateLobbyUI() {
        if (!this.lobbyId) return;
        
        // Clear players list
        this.playersList.innerHTML = '';
        
        // Count players and ready status
        let playersInLobby = 0;
        let playersReady = 0;
        let hostPresent = false;
        
        // Add players to the list
        for (const clientId in this.room.presence) {
            const playerData = this.room.presence[clientId];
            
            if (playerData.inLobby && playerData.lobbyId === this.lobbyId) {
                playersInLobby++;
                
                if (playerData.ready) {
                    playersReady++;
                }
                
                if (playerData.isHost) {
                    hostPresent = true;
                    
                    // If the host left, and we're the first non-host player, become the host
                    if (this.room.clientId !== clientId && !this.isHost && playersInLobby === 1) {
                        this.isHost = true;
                        this.room.updatePresence({
                            isHost: true
                        });
                    }
                }
                
                const playerCard = document.createElement('div');
                playerCard.className = `player-card ${playerData.ready ? 'player-ready' : ''}`;
                
                const playerName = document.createElement('div');
                playerName.className = 'player-name';
                playerName.textContent = this.room.peers[clientId]?.username || 'Unknown';
                
                const playerStatus = document.createElement('div');
                playerStatus.className = 'player-status';
                playerStatus.textContent = playerData.isHost ? 'Host' : (playerData.ready ? 'Ready' : 'Not Ready');
                
                playerCard.appendChild(playerName);
                playerCard.appendChild(playerStatus);
                this.playersList.appendChild(playerCard);
            }
        }
        
        // Update ready button text for local player
        const localPlayerData = this.room.presence[this.room.clientId];
        if (localPlayerData && localPlayerData.inLobby && localPlayerData.lobbyId === this.lobbyId) {
            document.getElementById('ready-btn').textContent = localPlayerData.ready ? 'Not Ready' : 'Ready';
        }
        
        // Update visibility of start game button
        this.startGameBtn.classList.toggle('hidden', !this.isHost);
        
        // Enable start button if all players are ready
        if (this.isHost) {
            const canStart = playersInLobby >= 2 && playersReady === playersInLobby - (this.isHost ? 1 : 0);
            this.startGameBtn.disabled = !canStart;
        }
    }
}

// Create lobby instance when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const lobby = new Lobby();
    window.lobby = lobby; // Make lobby accessible globally
});

