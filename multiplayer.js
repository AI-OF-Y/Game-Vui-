/**
 * Real-Time Multiplayer Room Controller for Tai Xiu Game
 * Connects via WebSocket to ws://<host>:8765
 */

class MultiplayerClient {
    constructor(game) {
        this.game = game;
        this.ws = null;
        this.isConnected = false;
        this.playerId = null;
        this.playerProfile = {
            name: localStorage.getItem('taixiu_nickname') || `Người Chơi ${Math.floor(Math.random() * 90 + 10)}`,
            avatar: localStorage.getItem('taixiu_avatar') || ['🐯', '🦁', '🐉', '🦅', '🐼', '🦊', '👑', '💎'][Math.floor(Math.random() * 8)]
        };
        this.playersList = [];
        this.chatMessages = [];
        this.squeezingPeer = null;

        this.initDOM();
        this.bindEvents();
        this.connect();
    }

    initDOM() {
        this.dom = {
            multiplayerBar: document.getElementById('multiplayerBar'),
            connStatusBadge: document.getElementById('connStatusBadge'),
            onlineCount: document.getElementById('onlineCount'),
            myAvatar: document.getElementById('myAvatar'),
            myNickname: document.getElementById('myNickname'),
            btnEditProfile: document.getElementById('btnEditProfile'),
            onlinePlayersContainer: document.getElementById('onlinePlayersContainer'),
            tableBetTai: document.getElementById('tableBetTai'),
            tableBetXiu: document.getElementById('tableBetXiu'),
            tableBetChan: document.getElementById('tableBetChan'),
            tableBetLe: document.getElementById('tableBetLe'),
            tableBetBao: document.getElementById('tableBetBao'),
            // Chat elements
            chatToggleBtn: document.getElementById('chatToggleBtn'),
            chatDrawer: document.getElementById('chatDrawer'),
            chatCloseBtn: document.getElementById('chatCloseBtn'),
            chatMessagesList: document.getElementById('chatMessagesList'),
            chatInput: document.getElementById('chatInput'),
            chatSendBtn: document.getElementById('chatSendBtn'),
            quickEmotes: document.querySelectorAll('.emote-btn'),
            unreadBadge: document.getElementById('unreadBadge')
        };
    }

    bindEvents() {
        // Profile edit
        if (this.dom.btnEditProfile) {
            this.dom.btnEditProfile.addEventListener('click', () => this.showEditProfileModal());
        }

        // Chat Drawer Toggle
        if (this.dom.chatToggleBtn) {
            this.dom.chatToggleBtn.addEventListener('click', () => {
                this.dom.chatDrawer.classList.toggle('open');
                if (this.dom.unreadBadge) this.dom.unreadBadge.style.display = 'none';
            });
        }
        if (this.dom.chatCloseBtn) {
            this.dom.chatCloseBtn.addEventListener('click', () => {
                this.dom.chatDrawer.classList.remove('open');
            });
        }

        // Send Chat
        if (this.dom.chatSendBtn) {
            this.dom.chatSendBtn.addEventListener('click', () => this.sendChatMessage());
        }
        if (this.dom.chatInput) {
            this.dom.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.sendChatMessage();
            });
        }

        // Quick Emote chips
        this.dom.quickEmotes.forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.dataset.text || btn.textContent;
                this.sendRawChat(text);
            });
        });
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8080';
        const wsUrl = `${protocol}//${host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);
        } catch (e) {
            console.warn('WebSocket connection not available, operating in solo offline mode.', e);
            this.updateConnectionUI(false);
            return;
        }

        this.ws.onopen = () => {
            this.isConnected = true;
            this.updateConnectionUI(true);
            // Send current profile and balance
            this.send({
                type: 'update_profile',
                name: this.playerProfile.name,
                avatar: this.playerProfile.avatar,
                balance: this.game.balance
            });
        };

        this.ws.onmessage = (event) => {
            try {
                const data = json_parse_safe(event.data);
                if (data) this.handleServerMessage(data);
            } catch (err) {
                console.error('Error handling WS message:', err);
            }
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this.updateConnectionUI(false);
            // Attempt auto reconnect after 4 seconds
            setTimeout(() => this.connect(), 4000);
        };

        this.ws.onerror = (err) => {
            console.warn('WS notice:', err);
        };
    }

    send(msgObj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msgObj));
        }
    }

    updateConnectionUI(connected) {
        if (!this.dom.connStatusBadge) return;

        if (connected) {
            this.dom.connStatusBadge.innerHTML = `<span class="live-dot" style="background:#2ecc71;"></span> 🟢 Đang kết nối bàn trực tuyến`;
            this.dom.connStatusBadge.style.color = '#2ecc71';
            if (this.dom.myNickname) this.dom.myNickname.textContent = this.playerProfile.name;
            if (this.dom.myAvatar) this.dom.myAvatar.textContent = this.playerProfile.avatar;
        } else {
            this.dom.connStatusBadge.innerHTML = `<span class="live-dot" style="background:#f39c12;"></span> 🟡 Chế độ Chơi Đơn (Ngoại tuyến)`;
            this.dom.connStatusBadge.style.color = '#f39c12';
            if (this.dom.onlineCount) this.dom.onlineCount.textContent = '1';
        }
    }

    handleServerMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                this.playerId = msg.your_id;
                this.updateTableBets(msg.room_state.table_bets);
                this.renderOnlinePlayers(msg.room_state.players);
                if (msg.history && msg.history.length > 0) {
                    this.game.history = msg.history;
                    this.game.saveHistory();
                    this.game.renderRoadmap();
                    this.game.renderHistoryTable();
                }
                if (msg.chat_messages) {
                    msg.chat_messages.forEach(c => this.appendChatMessage(c, false));
                }
                break;

            case 'player_joined':
                this.game.showToast(`👋 ${msg.player.avatar} ${msg.player.name} vừa tham gia bàn chơi!`);
                if (this.dom.onlineCount) this.dom.onlineCount.textContent = msg.player_count;
                break;

            case 'player_left':
                if (this.dom.onlineCount) this.dom.onlineCount.textContent = msg.player_count;
                break;

            case 'player_updated':
                // Refresh players list
                break;

            case 'phase_change':
                this.handlePhaseChange(msg);
                break;

            case 'tick':
                this.handleTick(msg.time_left);
                break;

            case 'bet_placed':
                this.updateTableBets(msg.table_bets);
                if (msg.player_id !== this.playerId) {
                    window.soundEngine.playChip();
                    this.showChipFlyEffect(msg);
                }
                break;

            case 'table_bets_updated':
                this.updateTableBets(msg.table_bets);
                break;

            case 'bets_cleared':
                this.updateTableBets(msg.table_bets);
                break;

            case 'refill_success':
                this.game.balance = msg.balance;
                this.game.saveBalance();
                this.game.updateWalletUI();
                break;

            case 'new_chat':
                this.appendChatMessage(msg.message, true);
                break;

            case 'squeeze_motion':
                if (msg.squeezer !== this.playerProfile.name) {
                    this.renderPeerSqueeze(msg);
                }
                break;

            case 'reveal_result':
                this.handleRevealResult(msg);
                break;
        }
    }

    handlePhaseChange(msg) {
        const phase = msg.phase;

        if (phase === 'betting') {
            this.game.gameState = 'betting';
            this.game.resetBowl();
            this.dom.tableBetTai && (this.dom.tableBetTai.textContent = '0');
            this.dom.tableBetXiu && (this.dom.tableBetXiu.textContent = '0');
            this.game.dom.roundIdText.textContent = `Phiên #${msg.round_id}`;
            this.game.dom.timerDisplay.style.display = 'flex';
            this.game.dom.timerSeconds.textContent = msg.time_left;
            this.game.showToast(`🔔 Bắt đầu phiên mới #${msg.round_id}! Mời đặt cược (20s).`);
        } else if (phase === 'shaking') {
            this.game.gameState = 'shaking';
            this.game.clearWinningHighlights();
            this.game.dom.bowlLid.classList.remove('opened');
            this.game.dom.bowlLid.classList.add('shaking');
            this.game.dom.diceList.forEach(d => d.classList.add('rolling'));
            this.game.dom.resultDisplay.innerHTML = '<span style="color:#f5c518;font-weight:700">Đang xóc đĩa & Lấy dữ liệu công khai Drand...</span>';
            window.soundEngine.playShake();
        } else if (phase === 'squeezing') {
            this.game.gameState = 'closed';
            this.game.dom.bowlLid.classList.remove('shaking');
            this.game.dom.bowlLid.classList.add('can-drag');
            this.game.dom.diceList.forEach(d => d.classList.remove('rolling'));
            if (msg.dice) {
                this.game.renderDiceFaces(msg.dice);
            }
            if (msg.current_round_data) {
                this.game.currentRoundData = msg.current_round_data;
                this.game.dom.sourceBadge.textContent = msg.current_round_data.isLiveWeb ? '🟢 Web Drand Live' : '🔵 WebCrypto Local';
            }
            this.game.dom.resultDisplay.innerHTML = '<span style="color:#ffd700;font-weight:700">🎲 Đã xóc xong! Kéo nắp bát ra từ từ để nặn xúc xắc</span>';
            this.game.updateButtonsState();
        }
    }

    handleTick(timeLeft) {
        if (this.game.dom.timerSeconds) {
            this.game.dom.timerSeconds.textContent = timeLeft;
            if (timeLeft <= 5 && timeLeft > 0 && this.game.gameState === 'betting') {
                window.soundEngine.playTick();
            }
        }
    }

    handleRevealResult(msg) {
        this.game.gameState = 'opened';
        this.game.updateButtonsState();
        this.game.dom.bowlLid.classList.remove('can-drag', 'dragging');
        this.game.dom.bowlLid.classList.add('opened');
        window.soundEngine.playOpen();

        const [d1, d2, d3] = msg.dice;
        const total = msg.total;
        const outcomeType = msg.outcome;

        // Announce tag
        let tagClass = outcomeType.toLowerCase();
        let tagLabel = msg.is_bao ? `BÃO ${d1} (${total} điểm)` : (outcomeType === 'TAI' ? `TÀI (${total} điểm)` : `XỈU (${total} điểm)`);
        this.game.dom.resultDisplay.innerHTML = `<div class="result-tag ${tagClass}">${tagLabel}</div>`;

        this.game.highlightWinners(outcomeType, total, msg.is_chan, msg.is_le);

        // Find my payout
        const myPayout = msg.player_payouts.find(p => p.id === this.playerId);
        if (myPayout) {
            this.game.balance = myPayout.balance;
            this.game.saveBalance();
            this.game.updateWalletUI();
            if (myPayout.win > 0) {
                this.game.showToast(`🎉 CHÚC MỪNG BẠN! Thắng +${myPayout.win.toLocaleString('vi-VN')} Xu!`);
                window.soundEngine.playWin();
            } else if (this.game.getTotalBetPlaced() > 0) {
                this.game.showToast(`Ván này chưa may mắn, chúc bạn thắng lớn ván sau!`);
                window.soundEngine.playLose();
            }
        }

        // Announce big winner of the room
        const bigWinner = msg.player_payouts.filter(p => p.win > 0).sort((a, b) => b.win - a.win)[0];
        if (bigWinner && bigWinner.id !== this.playerId) {
            this.game.showToast(`🏆 ${bigWinner.name} vừa nổ thắng lớn +${bigWinner.win.toLocaleString('vi-VN')} Xu!`);
        }

        // Record history
        if (msg.history_item) {
            this.game.history.unshift(msg.history_item);
            this.game.saveHistory();
            this.game.renderRoadmap();
            this.game.renderHistoryTable();
        }

        // Clear current bets
        ['tai', 'xiu', 'chan', 'le', 'bao'].forEach(k => this.game.currentBets[k] = 0);
        for (let i = 4; i <= 17; i++) this.game.currentBets.points[i] = 0;
        this.game.updatePlacedBetsUI();
    }

    renderPeerSqueeze(msg) {
        if (this.game.gameState !== 'closed') return;
        this.game.dom.bowlLid.style.transition = 'none';
        this.game.dom.bowlLid.style.transform = `translate(${msg.dx}px, ${msg.dy}px)`;
        this.game.dom.resultDisplay.innerHTML = `<span style="color:#f5c518;font-weight:700">👀 ${msg.squeezer} đang nặn xúc xắc...</span>`;
    }

    updateTableBets(tableBets) {
        if (!tableBets) return;
        if (this.dom.tableBetTai) this.dom.tableBetTai.textContent = (tableBets.tai || 0).toLocaleString('vi-VN');
        if (this.dom.tableBetXiu) this.dom.tableBetXiu.textContent = (tableBets.xiu || 0).toLocaleString('vi-VN');
        if (this.dom.tableBetChan) this.dom.tableBetChan.textContent = (tableBets.chan || 0).toLocaleString('vi-VN');
        if (this.dom.tableBetLe) this.dom.tableBetLe.textContent = (tableBets.le || 0).toLocaleString('vi-VN');
        if (this.dom.tableBetBao) this.dom.tableBetBao.textContent = (tableBets.bao || 0).toLocaleString('vi-VN');
    }

    renderOnlinePlayers(players) {
        if (!this.dom.onlinePlayersContainer || !players) return;
        this.dom.onlinePlayersContainer.innerHTML = '';
        if (this.dom.onlineCount) this.dom.onlineCount.textContent = players.length;

        players.slice(0, 10).forEach(p => {
            const el = document.createElement('div');
            el.className = 'player-chip-pill';
            el.title = `${p.name}: ${p.balance.toLocaleString('vi-VN')} Xu`;
            el.innerHTML = `<span>${p.avatar}</span> <span>${p.name}</span>`;
            this.dom.onlinePlayersContainer.appendChild(el);
        });
    }

    showChipFlyEffect(msg) {
        // Subtle toast or chip notice
        const targetBox = document.querySelector(`[data-bet="${msg.bet_type}"]`);
        if (targetBox) {
            targetBox.classList.add('peer-bet-glow');
            setTimeout(() => targetBox.classList.remove('peer-bet-glow'), 600);
        }
    }

    sendChatMessage() {
        const text = this.dom.chatInput.value.trim();
        if (!text) return;
        this.dom.chatInput.value = '';
        this.sendRawChat(text);
    }

    sendRawChat(text) {
        if (!text) return;
        this.send({
            type: 'chat',
            text: text
        });
    }

    appendChatMessage(chatMsg, showNotification = true) {
        if (!this.dom.chatMessagesList) return;
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-bubble-row';
        const isMe = chatMsg.id === this.playerId;
        if (isMe) msgEl.classList.add('is-me');

        msgEl.innerHTML = `
            <div class="chat-avatar">${chatMsg.avatar}</div>
            <div class="chat-body">
                <div class="chat-meta">
                    <span class="chat-name">${chatMsg.name}</span>
                    <span class="chat-time">${chatMsg.time || ''}</span>
                </div>
                <div class="chat-text">${escapeHTML(chatMsg.text)}</div>
            </div>
        `;
        this.dom.chatMessagesList.appendChild(msgEl);
        this.dom.chatMessagesList.scrollTop = this.dom.chatMessagesList.scrollHeight;

        // If drawer is closed, show badge
        if (showNotification && !this.dom.chatDrawer.classList.contains('open') && !isMe) {
            if (this.dom.unreadBadge) {
                this.dom.unreadBadge.style.display = 'inline-block';
            }
        }
    }

    showEditProfileModal() {
        const currentName = this.playerProfile.name;
        const avatars = ['🐯', '🦁', '🐉', '🦅', '🐼', '🦊', '👑', '💎', '🚀', '⭐', '🎲', '🔥'];

        this.game.dom.modalTitle.textContent = '✏️ Thay Đổi Tên & Avatar Của Bạn';
        this.game.dom.modalBody.innerHTML = `
            <div style="line-height:1.6;font-size:0.95rem;">
                <label style="display:block;margin-bottom:6px;font-weight:700;">Tên hiển thị trên bàn chơi:</label>
                <input type="text" id="editNicknameInput" value="${escapeHTML(currentName)}" maxlength="16" style="width:100%;padding:10px;background:#090e17;border:1px solid #d4af37;border-radius:8px;color:#fff;font-size:1rem;margin-bottom:14px;">

                <label style="display:block;margin-bottom:8px;font-weight:700;">Chọn Biểu Tượng Avatar:</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;" id="avatarSelectGrid">
                    ${avatars.map(av => `<button class="avatar-pick-btn ${av === this.playerProfile.avatar ? 'selected' : ''}" data-av="${av}" style="font-size:1.5rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:8px;cursor:pointer;">${av}</button>`).join('')}
                </div>

                <button id="btnSaveProfile" style="width:100%;background:linear-gradient(135deg,#f39c12,#d35400);color:#fff;border:none;padding:12px;font-size:1rem;font-weight:700;border-radius:10px;cursor:pointer;">
                    Lưu Thay Đổi
                </button>
            </div>
        `;

        let selectedAvatar = this.playerProfile.avatar;
        document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.avatar-pick-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedAvatar = btn.dataset.av;
            });
        });

        document.getElementById('btnSaveProfile').addEventListener('click', () => {
            const newName = document.getElementById('editNicknameInput').value.trim() || 'Người Chơi';
            this.playerProfile.name = newName;
            this.playerProfile.avatar = selectedAvatar;
            localStorage.setItem('taixiu_nickname', newName);
            localStorage.setItem('taixiu_avatar', selectedAvatar);

            if (this.dom.myNickname) this.dom.myNickname.textContent = newName;
            if (this.dom.myAvatar) this.dom.myAvatar.textContent = selectedAvatar;

            this.send({
                type: 'update_profile',
                name: newName,
                avatar: selectedAvatar,
                balance: this.game.balance
            });

            this.game.closeModal();
            this.game.showToast('✅ Đã cập nhật hồ sơ bàn chơi thành công!');
        });

        this.game.openModal();
    }
}

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

function json_parse_safe(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
}

// Hook into TaiXiuGame when ready
window.addEventListener('DOMContentLoaded', () => {
    if (window.game) {
        window.multiplayerClient = new MultiplayerClient(window.game);
        window.game.multiplayer = window.multiplayerClient;
    }
});
