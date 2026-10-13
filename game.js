/**
 * Main Game Controller for Tai Xiu (Sic Bo) Fun Edition
 */

class TaiXiuGame {
    constructor() {
        this.balance = parseInt(localStorage.getItem('taixiu_balance')) || 50000;
        this.selectedChip = 1000;
        this.currentBets = {
            tai: 0,
            xiu: 0,
            chan: 0,
            le: 0,
            bao: 0,
            points: {}
        };
        for (let i = 4; i <= 17; i++) {
            this.currentBets.points[i] = 0;
        }

        this.history = JSON.parse(localStorage.getItem('taixiu_history')) || [];
        this.currentRoundData = null;
        this.gameState = 'betting'; // 'betting' | 'shaking' | 'closed' | 'opened'
        this.mode = 'manual'; // 'manual' | 'auto'
        this.autoTimer = null;
        this.autoSecondsLeft = 20;

        this.multipliers = {
            tai: 1,
            xiu: 1,
            chan: 1,
            le: 1,
            bao: 30,
            points: {
                4: 60, 17: 60,
                5: 30, 16: 30,
                6: 18, 15: 18,
                7: 12, 14: 12,
                8: 8,  13: 8,
                9: 6,  10: 6, 11: 6, 12: 6
            }
        };

        this.initDOM();
        this.bindEvents();
        this.updateWalletUI();
        this.renderRoadmap();
        this.renderHistoryTable();
        this.resetBowl();
    }

    initDOM() {
        this.dom = {
            walletBalance: document.getElementById('walletBalance'),
            btnRefill: document.getElementById('btnRefill'),
            soundToggle: document.getElementById('soundToggle'),
            helpBtn: document.getElementById('helpBtn'),
            verifyBtn: document.getElementById('verifyBtn'),
            roundIdText: document.getElementById('roundIdText'),
            sourceBadge: document.getElementById('sourceBadge'),
            timerDisplay: document.getElementById('timerDisplay'),
            timerSeconds: document.getElementById('timerSeconds'),
            modeManual: document.getElementById('modeManual'),
            modeAuto: document.getElementById('modeAuto'),
            bowlContainer: document.getElementById('bowlContainer'),
            bowlLid: document.getElementById('bowlLid'),
            diceList: [
                document.getElementById('dice1'),
                document.getElementById('dice2'),
                document.getElementById('dice3')
            ],
            resultDisplay: document.getElementById('resultDisplay'),
            btnShake: document.getElementById('btnShake'),
            btnOpen: document.getElementById('btnOpen'),
            btnClear: document.getElementById('btnClear'),
            chips: document.querySelectorAll('.chip'),
            betBoxes: document.querySelectorAll('.bet-box'),
            pointBtns: document.querySelectorAll('.point-btn'),
            beadPlate: document.getElementById('beadPlate'),
            statTai: document.getElementById('statTai'),
            statXiu: document.getElementById('statXiu'),
            statBao: document.getElementById('statBao'),
            historyTableBody: document.getElementById('historyTableBody'),
            toastContainer: document.getElementById('toastContainer'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalTitle: document.getElementById('modalTitle'),
            modalBody: document.getElementById('modalBody'),
            modalClose: document.getElementById('modalClose')
        };
    }

    bindEvents() {
        // Chip selection
        this.dom.chips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.dom.chips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.selectedChip = parseInt(chip.dataset.val);
                window.soundEngine.playChip();
            });
        });

        // Refill button
        this.dom.btnRefill.addEventListener('click', () => {
            this.balance += 10000;
            this.saveBalance();
            this.updateWalletUI();
            this.showToast('🎉 Nhận thành công 10,000 Xu giải trí miễn phí!');
            window.soundEngine.playWin();
            if (this.multiplayer && this.multiplayer.isConnected) {
                this.multiplayer.send({ type: 'refill' });
            }
        });

        // Sound toggle
        this.dom.soundToggle.addEventListener('click', () => {
            const enabled = window.soundEngine.toggle();
            this.dom.soundToggle.textContent = enabled ? '🔊' : '🔇';
            this.showToast(enabled ? 'Đã bật âm thanh' : 'Đã tắt âm thanh');
        });

        // Betting click on Main & Secondary Bets
        this.dom.betBoxes.forEach(box => {
            box.addEventListener('click', () => {
                if (this.gameState !== 'betting') {
                    this.showToast('⚠️ Hiện không trong thời gian đặt cược!');
                    return;
                }
                const betType = box.dataset.bet;
                this.placeBet(betType);
            });
        });

        // Betting on specific points
        this.dom.pointBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.gameState !== 'betting') {
                    this.showToast('⚠️ Hiện không trong thời gian đặt cược!');
                    return;
                }
                const point = parseInt(btn.dataset.point);
                this.placePointBet(point);
            });
        });

        // Action buttons
        this.dom.btnShake.addEventListener('click', () => this.startShake());
        this.dom.btnOpen.addEventListener('click', () => this.openBowl());
        this.dom.btnClear.addEventListener('click', () => this.clearBets());

        // Mode switch
        this.dom.modeManual.addEventListener('click', () => this.switchMode('manual'));
        this.dom.modeAuto.addEventListener('click', () => this.switchMode('auto'));

        // Initialize drag-to-reveal (Nặn xúc xắc)
        this.initLidDrag();

        // Modals
        this.dom.helpBtn.addEventListener('click', () => this.showHelpModal());
        this.dom.verifyBtn.addEventListener('click', () => this.showVerifyModal());
        this.dom.modalClose.addEventListener('click', () => this.closeModal());
        this.dom.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.dom.modalOverlay) this.closeModal();
        });
    }

    saveBalance() {
        localStorage.setItem('taixiu_balance', this.balance);
    }

    saveHistory() {
        if (this.history.length > 100) this.history.pop();
        localStorage.setItem('taixiu_history', JSON.stringify(this.history));
    }

    updateWalletUI() {
        this.dom.walletBalance.textContent = this.balance.toLocaleString('vi-VN');
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        this.dom.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    placeBet(betType) {
        if (this.balance < this.selectedChip) {
            this.showToast('❌ Bạn không đủ Xu! Hãy bấm "Nhận Xu Cứu Trợ" để lấy thêm.');
            return;
        }

        this.balance -= this.selectedChip;
        this.currentBets[betType] += this.selectedChip;
        this.saveBalance();
        this.updateWalletUI();
        this.updatePlacedBetsUI();
        window.soundEngine.playChip();

        if (this.multiplayer && this.multiplayer.isConnected) {
            this.multiplayer.send({ type: 'place_bet', bet_type: betType, amount: this.selectedChip });
        }
    }

    placePointBet(point) {
        if (this.balance < this.selectedChip) {
            this.showToast('❌ Bạn không đủ Xu! Hãy bấm "Nhận Xu Cứu Trợ" để lấy thêm.');
            return;
        }

        this.balance -= this.selectedChip;
        this.currentBets.points[point] += this.selectedChip;
        this.saveBalance();
        this.updateWalletUI();
        this.updatePlacedBetsUI();
        window.soundEngine.playChip();

        if (this.multiplayer && this.multiplayer.isConnected) {
            this.multiplayer.send({ type: 'place_bet', bet_type: String(point), amount: this.selectedChip });
        }
    }

    updatePlacedBetsUI() {
        // Update main and secondary bets
        this.dom.betBoxes.forEach(box => {
            const betType = box.dataset.bet;
            const badge = box.querySelector('.placed-bet-badge');
            const amount = this.currentBets[betType];
            if (badge) {
                badge.textContent = amount > 0 ? `${amount.toLocaleString('vi-VN')} Xu` : '';
            }
        });

        // Update point bets
        this.dom.pointBtns.forEach(btn => {
            const point = parseInt(btn.dataset.point);
            const badge = btn.querySelector('.point-placed');
            const amount = this.currentBets.points[point];
            if (badge) {
                badge.textContent = amount > 0 ? `${amount.toLocaleString('vi-VN')}` : '';
            }
        });
    }

    clearBets() {
        if (this.gameState !== 'betting') return;

        let totalRefund = 0;
        ['tai', 'xiu', 'chan', 'le', 'bao'].forEach(k => {
            totalRefund += this.currentBets[k];
            this.currentBets[k] = 0;
        });

        for (let i = 4; i <= 17; i++) {
            totalRefund += this.currentBets.points[i];
            this.currentBets.points[i] = 0;
        }

        if (totalRefund > 0) {
            this.balance += totalRefund;
            this.saveBalance();
            this.updateWalletUI();
            this.updatePlacedBetsUI();
            this.showToast(`Đã huỷ cược, hoàn lại ${totalRefund.toLocaleString('vi-VN')} Xu.`);
            window.soundEngine.playChip();

            if (this.multiplayer && this.multiplayer.isConnected) {
                this.multiplayer.send({ type: 'clear_bets' });
            }
        }
    }

    getTotalBetPlaced() {
        let sum = this.currentBets.tai + this.currentBets.xiu + this.currentBets.chan + this.currentBets.le + this.currentBets.bao;
        for (let i = 4; i <= 17; i++) {
            sum += this.currentBets.points[i];
        }
        return sum;
    }

    initLidDrag() {
        let isDragging = false;
        let startX = 0, startY = 0;
        let currentDx = 0, currentDy = 0;
        let moved = false;

        const onStart = (clientX, clientY) => {
            if (this.gameState !== 'closed') return;
            isDragging = true;
            moved = false;
            startX = clientX;
            startY = clientY;
            currentDx = 0;
            currentDy = 0;
            this.dom.bowlLid.classList.add('dragging');
            this.dom.bowlLid.style.transition = 'none';
        };

        const onMove = (clientX, clientY) => {
            if (!isDragging) return;
            const dx = clientX - startX;
            const dy = clientY - startY;
            currentDx = dx;
            currentDy = dy;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                moved = true;
                if (this.multiplayer && this.multiplayer.isConnected) {
                    this.multiplayer.send({ type: 'squeeze_move', dx: Math.round(dx), dy: Math.round(dy) });
                }
            }

            // Move the lid directly with the pointer
            this.dom.bowlLid.style.transform = `translate(${dx}px, ${dy}px)`;

            // If dragged far enough (distance > 105px), finish opening automatically
            const dist = Math.hypot(dx, dy);
            if (dist > 105) {
                isDragging = false;
                this.dom.bowlLid.classList.remove('dragging');
                this.finishDragOpen(dx, dy);
            }
        };

        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            this.dom.bowlLid.classList.remove('dragging');

            const dist = Math.hypot(currentDx, currentDy);
            if (dist > 70) {
                // Dragged sufficiently far -> open!
                this.finishDragOpen(currentDx, currentDy);
            } else {
                // If clicked/tapped without drag, open directly
                if (!moved) {
                    this.openBowl();
                    return;
                }
                // Else snap back smoothly so player can peek/nặn again!
                this.dom.bowlLid.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
                this.dom.bowlLid.style.transform = 'translate(0px, 0px)';
            }
        };

        // Mouse events
        this.dom.bowlLid.addEventListener('mousedown', (e) => {
            onStart(e.clientX, e.clientY);
        });

        window.addEventListener('mousemove', (e) => {
            onMove(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', () => {
            onEnd();
        });

        // Touch events (Mobile & Tablet)
        this.dom.bowlLid.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches[0]) {
                onStart(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches && e.touches[0]) {
                onMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            onEnd();
        });
    }

    finishDragOpen(dx, dy) {
        const angle = Math.atan2(dy || -1, dx || 0);
        const targetX = Math.cos(angle) * 300;
        const targetY = Math.sin(angle) * 300;

        this.dom.bowlLid.style.transition = 'transform 0.45s ease-out, opacity 0.35s ease-out';
        this.dom.bowlLid.style.transform = `translate(${targetX}px, ${targetY}px) scale(0.85)`;
        this.dom.bowlLid.style.opacity = '0';
        this.dom.bowlLid.classList.remove('can-drag');

        this.openBowl(true);
    }

    resetBowl() {
        this.dom.bowlLid.classList.remove('opened', 'shaking', 'dragging', 'can-drag');
        this.dom.bowlLid.style.transform = '';
        this.dom.bowlLid.style.opacity = '';
        this.dom.bowlLid.style.transition = '';
        this.dom.resultDisplay.innerHTML = '';
        this.clearWinningHighlights();
        this.renderDiceFaces([1, 2, 3]);
        this.gameState = 'betting';
        this.updateButtonsState();
    }

    updateButtonsState() {
        if (this.mode === 'auto') {
            this.dom.btnShake.disabled = true;
            this.dom.btnOpen.disabled = true;
            this.dom.btnClear.disabled = this.gameState !== 'betting';
            return;
        }

        this.dom.btnShake.disabled = this.gameState === 'shaking';
        this.dom.btnOpen.disabled = this.gameState !== 'closed';
        this.dom.btnClear.disabled = this.gameState !== 'betting';
    }

    async startShake() {
        if (this.gameState === 'shaking') return;

        this.gameState = 'shaking';
        this.updateButtonsState();
        this.clearWinningHighlights();

        // Close lid, reset drag positions and start shaking animation
        this.dom.bowlLid.classList.remove('opened', 'dragging', 'can-drag');
        this.dom.bowlLid.style.transform = '';
        this.dom.bowlLid.style.opacity = '';
        this.dom.bowlLid.style.transition = '';
        this.dom.bowlLid.classList.add('shaking');
        this.dom.diceList.forEach(d => d.classList.add('rolling'));
        this.dom.resultDisplay.innerHTML = '<span style="color:#f5c518;font-weight:700">Đang xóc đĩa & Lấy dữ liệu công khai...</span>';

        window.soundEngine.playShake();

        // Fetch provably fair dice from Drand Web API
        const roundData = await window.provableRandomness.fetchRandomDice();
        this.currentRoundData = roundData;

        // Update Round ID indicator
        this.dom.roundIdText.textContent = `Phiên #${roundData.round}`;
        this.dom.sourceBadge.textContent = roundData.isLiveWeb ? '🟢 Web Drand Live' : '🔵 WebCrypto Local';

        // Wait shake duration
        await new Promise(r => setTimeout(r, 1400));

        this.dom.bowlLid.classList.remove('shaking');
        this.dom.bowlLid.classList.add('can-drag');
        this.dom.diceList.forEach(d => d.classList.remove('rolling'));
        this.renderDiceFaces(roundData.dice);

        this.gameState = 'closed';
        this.updateButtonsState();
        this.dom.resultDisplay.innerHTML = '<span style="color:#ffd700;font-weight:700">🎲 Đã xóc xong! Kéo nắp bát ra từ từ để nặn xúc xắc</span>';

        if (this.mode === 'auto') {
            setTimeout(() => this.openBowl(), 1500);
        }
    }

    openBowl(skipLidAnim = false) {
        if (this.gameState !== 'closed') return;

        this.gameState = 'opened';
        this.updateButtonsState();
        this.dom.bowlLid.classList.remove('can-drag', 'dragging');
        if (!skipLidAnim) {
            this.dom.bowlLid.classList.add('opened');
        }
        window.soundEngine.playOpen();

        const [d1, d2, d3] = this.currentRoundData.dice;
        const total = d1 + d2 + d3;
        const isBao = (d1 === d2 && d2 === d3);
        const isTai = !isBao && (total >= 11 && total <= 17);
        const isXiu = !isBao && (total >= 4 && total <= 10);
        const isChan = (total % 2 === 0);
        const isLe = (total % 2 !== 0);

        let outcomeType = isBao ? 'BAO' : (isTai ? 'TAI' : 'XIU');

        // Announce Result Banner
        let tagClass = outcomeType.toLowerCase();
        let tagLabel = isBao ? `BÃO ${d1} (${total} điểm)` : (isTai ? `TÀI (${total} điểm)` : `XỈU (${total} điểm)`);
        this.dom.resultDisplay.innerHTML = `<div class="result-tag ${tagClass}">${tagLabel}</div>`;

        // Highlight winners
        this.highlightWinners(outcomeType, total, isChan, isLe);

        // Calculate Payout
        let totalWin = 0;
        let betRefund = 0;

        // Tài / Xỉu
        if (isTai && this.currentBets.tai > 0) {
            totalWin += this.currentBets.tai * this.multipliers.tai;
            betRefund += this.currentBets.tai;
        }
        if (isXiu && this.currentBets.xiu > 0) {
            totalWin += this.currentBets.xiu * this.multipliers.xiu;
            betRefund += this.currentBets.xiu;
        }

        // Chẵn / Lẻ (nếu không có Bão)
        if (!isBao) {
            if (isChan && this.currentBets.chan > 0) {
                totalWin += this.currentBets.chan * this.multipliers.chan;
                betRefund += this.currentBets.chan;
            }
            if (isLe && this.currentBets.le > 0) {
                totalWin += this.currentBets.le * this.multipliers.le;
                betRefund += this.currentBets.le;
            }
        }

        // Bão
        if (isBao && this.currentBets.bao > 0) {
            totalWin += this.currentBets.bao * this.multipliers.bao;
            betRefund += this.currentBets.bao;
        }

        // Điểm chính xác
        if (this.currentBets.points[total] > 0) {
            const mult = this.multipliers.points[total] || 0;
            totalWin += this.currentBets.points[total] * mult;
            betRefund += this.currentBets.points[total];
        }

        const netProfit = totalWin;
        const totalReceived = totalWin + betRefund;

        if (totalReceived > 0) {
            this.balance += totalReceived;
            this.saveBalance();
            this.updateWalletUI();
            this.showToast(`🎉 CHÚC MỪNG! Bạn thắng +${totalReceived.toLocaleString('vi-VN')} Xu!`);
            window.soundEngine.playWin();
        } else if (this.getTotalBetPlaced() > 0) {
            this.showToast(`Rất tiếc! Ván này chưa may mắn, chúc bạn may mắn ván sau!`);
            window.soundEngine.playLose();
        }

        // Record history
        const historyRecord = {
            round: this.currentRoundData.round,
            dice: [d1, d2, d3],
            total: total,
            outcome: outcomeType,
            bet: this.getTotalBetPlaced(),
            win: totalReceived,
            source: this.currentRoundData.source,
            randomnessHex: this.currentRoundData.randomnessHex,
            timestamp: new Date().toLocaleTimeString('vi-VN')
        };
        this.history.unshift(historyRecord);
        this.saveHistory();
        this.renderRoadmap();
        this.renderHistoryTable();

        // Clear current bets for next round
        ['tai', 'xiu', 'chan', 'le', 'bao'].forEach(k => this.currentBets[k] = 0);
        for (let i = 4; i <= 17; i++) this.currentBets.points[i] = 0;
        this.updatePlacedBetsUI();

        if (this.mode === 'manual') {
            setTimeout(() => {
                this.gameState = 'betting';
                this.updateButtonsState();
            }, 3000);
        }
    }

    renderDiceFaces(diceValues) {
        diceValues.forEach((val, idx) => {
            const diceEl = this.dom.diceList[idx];
            diceEl.className = `dice dice-${val}`;
            diceEl.innerHTML = '';

            const pipsCount = val;
            const positions = this.getDicePipPositions(pipsCount);
            positions.forEach(pos => {
                const pip = document.createElement('div');
                pip.className = 'pip';
                pip.style.gridRow = pos.row;
                pip.style.gridColumn = pos.col;
                diceEl.appendChild(pip);
            });
        });
    }

    getDicePipPositions(val) {
        switch (val) {
            case 1:
                return [{ row: 2, col: 2 }];
            case 2:
                return [{ row: 1, col: 1 }, { row: 3, col: 3 }];
            case 3:
                return [{ row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 }];
            case 4:
                return [
                    { row: 1, col: 1 }, { row: 1, col: 3 },
                    { row: 3, col: 1 }, { row: 3, col: 3 }
                ];
            case 5:
                return [
                    { row: 1, col: 1 }, { row: 1, col: 3 },
                    { row: 2, col: 2 },
                    { row: 3, col: 1 }, { row: 3, col: 3 }
                ];
            case 6:
                return [
                    { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 3, col: 1 },
                    { row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 3 }
                ];
            default:
                return [];
        }
    }

    highlightWinners(outcomeType, total, isChan, isLe) {
        this.clearWinningHighlights();

        if (outcomeType === 'TAI') {
            document.querySelector('.bet-box-tai')?.classList.add('winner');
        } else if (outcomeType === 'XIU') {
            document.querySelector('.bet-box-xiu')?.classList.add('winner');
        } else if (outcomeType === 'BAO') {
            document.querySelector('[data-bet="bao"]')?.classList.add('winner');
        }

        if (outcomeType !== 'BAO') {
            if (isChan) document.querySelector('[data-bet="chan"]')?.classList.add('winner');
            if (isLe) document.querySelector('[data-bet="le"]')?.classList.add('winner');
        }

        const pointBtn = document.querySelector(`.point-btn[data-point="${total}"]`);
        if (pointBtn) pointBtn.classList.add('winner');
    }

    clearWinningHighlights() {
        document.querySelectorAll('.bet-box, .point-btn').forEach(el => el.classList.remove('winner'));
    }

    switchMode(newMode) {
        if (this.mode === newMode) return;
        this.mode = newMode;

        if (newMode === 'auto') {
            this.dom.modeAuto.classList.add('active');
            this.dom.modeManual.classList.remove('active');
            this.dom.timerDisplay.style.display = 'flex';
            this.startAutoLoop();
            this.showToast('Đã chuyển sang chế độ Tự động (Phiên 25 giây)');
        } else {
            this.dom.modeManual.classList.add('active');
            this.dom.modeAuto.classList.remove('active');
            this.dom.timerDisplay.style.display = 'none';
            if (this.autoTimer) clearInterval(this.autoTimer);
            this.resetBowl();
            this.showToast('Đã chuyển sang chế độ Thủ công (Tự lắc & Tự mở bát)');
        }
        this.updateButtonsState();
    }

    startAutoLoop() {
        if (this.autoTimer) clearInterval(this.autoTimer);
        this.autoSecondsLeft = 20;
        this.resetBowl();
        this.dom.timerSeconds.textContent = this.autoSecondsLeft;

        this.autoTimer = setInterval(() => {
            if (this.mode !== 'auto') {
                clearInterval(this.autoTimer);
                return;
            }

            if (this.gameState === 'betting') {
                this.autoSecondsLeft--;
                this.dom.timerSeconds.textContent = this.autoSecondsLeft;
                if (this.autoSecondsLeft <= 5 && this.autoSecondsLeft > 0) {
                    window.soundEngine.playTick();
                }

                if (this.autoSecondsLeft <= 0) {
                    this.startShake();
                }
            } else if (this.gameState === 'opened') {
                this.autoSecondsLeft = 20;
                this.dom.timerSeconds.textContent = this.autoSecondsLeft;
                this.resetBowl();
            }
        }, 1000);
    }

    renderRoadmap() {
        this.dom.beadPlate.innerHTML = '';
        const recent = this.history.slice(0, 60).reverse();

        let taiCount = 0;
        let xiuCount = 0;
        let baoCount = 0;

        recent.forEach(item => {
            const bead = document.createElement('div');
            bead.className = `bead ${item.outcome.toLowerCase()}`;
            bead.textContent = item.outcome === 'BAO' ? 'B' : (item.outcome === 'TAI' ? 'T' : 'X');
            bead.title = `Phiên #${item.round}: [${item.dice.join('-')}] = ${item.total} (${item.outcome})`;
            this.dom.beadPlate.appendChild(bead);

            if (item.outcome === 'TAI') taiCount++;
            else if (item.outcome === 'XIU') xiuCount++;
            else if (item.outcome === 'BAO') baoCount++;
        });

        const totalRounds = recent.length || 1;
        const pctTai = Math.round((taiCount / totalRounds) * 100);
        const pctXiu = Math.round((xiuCount / totalRounds) * 100);

        this.dom.statTai.textContent = `${taiCount} (${pctTai}%)`;
        this.dom.statXiu.textContent = `${xiuCount} (${pctXiu}%)`;
        this.dom.statBao.textContent = `${baoCount}`;
    }

    renderHistoryTable() {
        this.dom.historyTableBody.innerHTML = '';
        const recent = this.history.slice(0, 15);

        if (recent.length === 0) {
            this.dom.historyTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#95a5a6;padding:20px;">Chưa có dữ liệu phiên cược nào. Hãy tham gia ngay!</td></tr>`;
            return;
        }

        recent.forEach(item => {
            const tr = document.createElement('tr');
            const outcomeColor = item.outcome === 'TAI' ? '#e74c3c' : (item.outcome === 'XIU' ? '#3498db' : '#f1c40f');
            const winColor = item.win > 0 ? '#2ecc71' : '#95a5a6';

            tr.innerHTML = `
                <td><strong>#${item.round}</strong></td>
                <td>${item.timestamp}</td>
                <td><span style="font-weight:700;">${item.dice.join(' - ')}</span></td>
                <td><strong>${item.total}</strong></td>
                <td><span style="color:${outcomeColor};font-weight:800;">${item.outcome}</span></td>
                <td>${item.bet > 0 ? item.bet.toLocaleString('vi-VN') + ' Xu' : '-'}</td>
                <td style="color:${winColor};font-weight:700;">${item.win > 0 ? '+' + item.win.toLocaleString('vi-VN') + ' Xu' : (item.bet > 0 ? '0' : '-')}</td>
            `;
            this.dom.historyTableBody.appendChild(tr);
        });
    }

    showHelpModal() {
        this.dom.modalTitle.textContent = '📖 Hướng Dẫn & Luật Chơi Tài Xỉu';
        this.dom.modalBody.innerHTML = `
            <div style="line-height:1.6;font-size:0.92rem;">
                <p style="margin-bottom:12px;color:#2ecc71;font-weight:600;">
                    🛡️ Đây là trò chơi hoàn toàn giải trí miễn phí. Không sử dụng tiền thật, không quy đổi giá trị thực tế dưới mọi hình thức!
                </p>
                <h4 style="color:#f5c518;margin:12px 0 6px 0;">1. Quy Tắc Tài - Xỉu (3 Xúc Xắc):</h4>
                <ul style="padding-left:20px;margin-bottom:12px;">
                    <li><strong>XỈU (4 đến 10 điểm):</strong> Tỷ lệ thưởng 1 : 1</li>
                    <li><strong>TÀI (11 đến 17 điểm):</strong> Tỷ lệ thưởng 1 : 1</li>
                    <li><strong>BÃO (3 xúc xắc giống nhau, ví dụ 1-1-1, 6-6-6):</strong> Nhà cái thắng cược Tài/Xỉu thường. Nếu bạn đặt ô <strong>BÃO</strong> sẽ nhận thưởng khủng 1 : 30!</li>
                </ul>

                <h4 style="color:#f5c518;margin:12px 0 6px 0;">2. Cược Chẵn / Lẻ:</h4>
                <p>Tổng điểm của 3 viên là số Chẵn hoặc Lẻ (Tỷ lệ 1 : 1, trừ trường hợp ra Bão).</p>

                <h4 style="color:#f5c518;margin:12px 0 6px 0;">3. Cược Tổng Điểm Chính Xác:</h4>
                <p>Dự đoán chính xác tổng điểm từ 4 đến 17 với tỷ lệ thưởng lên đến 1 : 60.</p>

                <h4 style="color:#f5c518;margin:12px 0 6px 0;">4. Hết Xu Thì Sao?</h4>
                <p>Bấm nút <strong>"Nhận Xu Cứu Trợ"</strong> ở góc trên bên phải để nhận ngay 10,000 Xu miễn phí bất kỳ lúc nào!</p>
            </div>
        `;
        this.openModal();
    }

    showVerifyModal() {
        this.dom.modalTitle.textContent = '🔍 Cơ Chế Minh Bạch Dữ Liệu Công Khai (Provably Fair)';
        const cur = this.currentRoundData;
        if (!cur) {
            this.dom.modalBody.innerHTML = `
                <p>Chưa có phiên cược nào được thực hiện. Hãy lắc một ván để xem dữ liệu mã băm ngẫu nhiên được tải từ Web!</p>
            `;
        } else {
            this.dom.modalBody.innerHTML = `
                <div style="line-height:1.6;font-size:0.9rem;">
                    <p>Hệ thống sử dụng mạng lưới tạo tính ngẫu nhiên phi tập trung công khai <strong>League of Entropy (Drand - Cloudflare)</strong>, đảm bảo 100% không gian lận:</p>
                    
                    <div style="margin:10px 0;">
                        <strong>Nguồn dữ liệu:</strong> ${cur.source}<br>
                        <strong>Mã phiên (Round ID):</strong> #${cur.round}<br>
                        <strong>Chữ ký số (Signature):</strong>
                        <div class="code-box">${cur.signature}</div>
                        <strong>Chuỗi ngẫu nhiên (Randomness Hex):</strong>
                        <div class="code-box">${cur.randomnessHex}</div>
                    </div>

                    <h4 style="color:#f5c518;margin-top:10px;">Công thức tính 3 Xúc Xắc:</h4>
                    <p style="color:#95a5a6;font-size:0.85rem;">Cắt chuỗi Hex thành 3 phần 32-bit (8 ký tự hex), chuyển đổi sang số nguyên và chia lấy dư cho 6 rồi cộng 1:</p>
                    <ul style="padding-left:20px;margin-top:8px;">
                        ${cur.seeds.map((s, idx) => `<li><strong>Xúc xắc ${idx + 1}:</strong> Hex [${s.chunk}] -> Số ${s.int} -> <code>${s.formula}</code></li>`).join('')}
                    </ul>
                </div>
            `;
        }
        this.openModal();
    }

    openModal() {
        this.dom.modalOverlay.classList.add('active');
    }

    closeModal() {
        this.dom.modalOverlay.classList.remove('active');
    }
}

// Instantiate game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.game = new TaiXiuGame();
});
