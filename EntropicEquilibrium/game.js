// ============================================================
// 数据定义
// ============================================================
const PASSIVE_POOL = [
    { id:'iron_bone',   icon:'🛡', name:'铁骨',     desc:'失衡时扣血速度 -40%', type:'passive' },
    { id:'inertia',     icon:'⚖', name:'惯性缓冲', desc:'平衡木倾斜速度 -25%', type:'passive' },
    { id:'resonance',   icon:'💜', name:'紫色共鸣', desc:'平衡时 DPS ×1.4',     type:'passive' },
    { id:'drain',       icon:'❤', name:'生命虹吸', desc:'平衡时每秒回血 2',     type:'passive' },
    { id:'wide_bal',    icon:'🎯', name:'宽容之心', desc:'平衡判定范围 +8°',     type:'passive' },
];

const ACTIVE_POOL = [
    { id:'reset',       icon:'⚡', name:'归零',     desc:'立即将平衡木复位',             type:'active', cd:8  },
    { id:'reflect',     icon:'🔄', name:'反弹',     desc:'将失衡力度转化为伤害',         type:'active', cd:12 },
    { id:'slow',        icon:'🕐', name:'时间膨胀', desc:'3秒内倾斜速度减半',            type:'active', cd:15 },
    { id:'entropy',     icon:'🔥', name:'熵爆',     desc:'失去20%HP，造成大量伤害',      type:'active', cd:20 },
];

const ENEMIES = [
    {
        name:'虚空低语',
        maxHp: 80,
        lines: ['你以为你能保持清醒吗？','每一次颤抖都在提醒你——你不够稳。','呵，又失衡了。'],
        skills: ['gravity_shift'],
        skillInterval: 5000,
    },
    {
        name:'混沌回响',
        maxHp: 150,
        lines: ['你的控制不过是幻觉。','我让你的手……开始反叛你。','感受那股拉力——它是你内心的真实。'],
        skills: ['gravity_shift', 'reverse_control'],
        skillInterval: 4000,
    },
    {
        name:'熵的具象',
        maxHp: 250,
        lines: ['秩序是暂时的，崩溃才是本质。','你看不见方向了吗？','脉冲——'],
        skills: ['gravity_shift', 'reverse_control', 'pulse', 'fog'],
        skillInterval: 3000,
    },
];

// ============================================================
// 游戏状态
// ============================================================
const G = {
    // 平衡木
    angle: 0,           // 当前倾斜角（度）
    angularVel: 0,      // 角速度
    gravityMult: 1,     // 重力倍数（技能可改）
    tiltSpeed: 1,       // 倾斜速度倍数（被动可改）
    controlReversed: false,
    fogActive: false,
    balanceThreshold: 15, // 平衡判定角度

    // 玩家
    playerHp: 100,
    playerMaxHp: 100,
    passives: [],
    // 4 个主动技能槽
    activeSkills: [null, null, null, null],
    activeCds:    [0, 0, 0, 0],
    activeCdMaxs: [0, 0, 0, 0],
    activeEffectTimer: 0,

    // 敌人
    waveIndex: 0,
    enemy: null,
    enemySkillTimer: 0,

    // 肉鸽
    phase: 'battle',
    lastTime: 0,

    // 效果
    damageFlash: 0,
};

// ============================================================
// DOM 引用
// ============================================================
const app          = document.getElementById('app');
const glitchCanvas = document.getElementById('glitch-canvas');
const balCanvas    = document.getElementById('balance-canvas');
const gc           = glitchCanvas.getContext('2d');
const bc           = balCanvas.getContext('2d');

const playerHpBar  = document.getElementById('player-hp-bar');
const playerHpText = document.getElementById('player-hp-text');
const enemyHpBar   = document.getElementById('enemy-hp-bar');
const enemyHpText  = document.getElementById('enemy-hp-text');
const waveNum      = document.getElementById('wave-num');
const enemyName    = document.getElementById('enemy-name');
const enemyDialog  = document.getElementById('enemy-dialog');
const enemySpeech  = document.getElementById('enemy-speech');
const balanceStatus= document.getElementById('balance-status-text');
const balanceInd   = document.getElementById('balance-indicator');
const passiveList  = document.getElementById('passive-list');
// 4 个技能槽 DOM
const slotBtns     = document.querySelectorAll('#active-slots .skill-btn');
const slotIcons    = document.querySelectorAll('#active-slots .skill-icon');
const slotNames    = document.querySelectorAll('#active-slots .skill-name');
const slotCdOvs    = document.querySelectorAll('#active-slots .cd-overlay');
const slotCdTexts  = document.querySelectorAll('#active-slots .cd-text');
const logMessages  = document.getElementById('log-messages');
const overlay      = document.getElementById('overlay');
const roguePanel   = document.getElementById('roguelike-panel');
const cardRow      = document.getElementById('card-row');
const gameoverPanel= document.getElementById('gameover-panel');
const finalWave    = document.getElementById('final-wave');
const btnRestart   = document.getElementById('btn-restart');

// ============================================================
// 输入
// ============================================================
const keys = {};
document.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (G.phase === 'battle') {
        const slot = ['1','2','3','4'].indexOf(e.key);
        if (slot !== -1) { e.preventDefault(); useActiveSkill(slot); }
    }
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
btnRestart.addEventListener('click', restartGame);

// ============================================================
// 平衡木绘制
// ============================================================
function resizeCanvases() {
    glitchCanvas.width  = window.innerWidth;
    glitchCanvas.height = window.innerHeight;
    balCanvas.width     = balCanvas.offsetWidth;
    balCanvas.height    = balCanvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();

function drawBalance() {
    const w = balCanvas.width, h = balCanvas.height;
    bc.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h * 0.55;
    const len = w * 0.42;
    const rad = (G.fogActive ? 0 : G.angle) * Math.PI / 180;

    // 支点三角
    bc.beginPath();
    bc.moveTo(cx, cy);
    bc.lineTo(cx - 14, cy + 28);
    bc.lineTo(cx + 14, cy + 28);
    bc.closePath();
    bc.fillStyle = 'rgba(139,92,246,0.6)';
    bc.fill();

    // 平衡木横梁
    const lx = cx - Math.cos(rad) * len, ly = cy - Math.sin(rad) * len;
    const rx = cx + Math.cos(rad) * len, ry = cy + Math.sin(rad) * len;

    const balanced = Math.abs(G.angle) < G.balanceThreshold;
    const beamColor = balanced ? '#8b5cf6' : '#ef4444';
    const glow = balanced ? 'rgba(139,92,246,0.8)' : 'rgba(239,68,68,0.8)';

    bc.shadowColor = glow;
    bc.shadowBlur  = 18;
    bc.beginPath();
    bc.moveTo(lx, ly);
    bc.lineTo(rx, ry);
    bc.strokeStyle = beamColor;
    bc.lineWidth = 6;
    bc.stroke();
    bc.shadowBlur = 0;

    // 两端挂件（箱子）
    function drawBox(x, y) {
        bc.save();
        bc.translate(x, y);
        bc.rotate(rad);
        bc.fillStyle = balanced ? 'rgba(139,92,246,0.7)' : 'rgba(239,68,68,0.7)';
        bc.strokeStyle = beamColor;
        bc.lineWidth = 2;
        bc.beginPath();
        bc.roundRect(-14, 0, 28, 28, 4);
        bc.fill();
        bc.stroke();
        bc.restore();
    }
    drawBox(lx, ly);
    drawBox(rx, ry);

    // 角度指示器（非迷雾时）
    if (!G.fogActive) {
        bc.font = '0.75rem Inter, sans-serif';
        bc.fillStyle = balanced ? 'rgba(139,92,246,0.7)' : 'rgba(239,68,68,0.7)';
        bc.textAlign = 'center';
        bc.fillText(`${G.angle.toFixed(1)}°`, cx, cy + 55);
    } else {
        bc.fillStyle = 'rgba(100,100,100,0.5)';
        bc.textAlign = 'center';
        bc.font = '0.75rem Inter, sans-serif';
        bc.fillText('感知受阻...', cx, cy + 55);
    }
}

// ============================================================
// Glitch 背景
// ============================================================
function drawGlitch() {
    const imbalance = Math.min(Math.abs(G.angle) / 60, 1);
    gc.clearRect(0, 0, glitchCanvas.width, glitchCanvas.height);
    if (imbalance < 0.15) return;

    const imgData = gc.createImageData(glitchCanvas.width, glitchCanvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = Math.random() * 255 * imbalance;
        d[i] = n; d[i+1] = n; d[i+2] = n; d[i+3] = 18 * imbalance;
    }
    gc.putImageData(imgData, 0, 0);

    if (Math.random() < imbalance * 0.25) {
        const y = Math.random() * glitchCanvas.height;
        gc.fillStyle = `rgba(139,92,246,${imbalance * 0.3})`;
        gc.fillRect(0, y, glitchCanvas.width, Math.random() * 8 * imbalance);
    }
}

// ============================================================
// UI 更新
// ============================================================
function updateHUD() {
    playerHpBar.style.width = `${G.playerHp / G.playerMaxHp * 100}%`;
    playerHpText.textContent = Math.ceil(G.playerHp);
    enemyHpBar.style.width   = `${G.enemy ? G.enemy.hp / G.enemy.maxHp * 100 : 0}%`;
    enemyHpText.textContent  = G.enemy ? Math.ceil(G.enemy.hp) : 0;
    waveNum.textContent      = G.waveIndex + 1;

    const balanced = Math.abs(G.angle) < G.balanceThreshold;
    const imbalance = Math.min(Math.abs(G.angle) / 60, 1);
    app.style.setProperty('--balance', imbalance.toFixed(3));
    app.style.setProperty('--jitter', `${imbalance * 4}px`);
    if (imbalance > 0.5) app.classList.add('high-balance-effect');
    else app.classList.remove('high-balance-effect');

    balanceInd.className = balanced ? 'balanced' : 'unbalanced';
    balanceStatus.textContent = balanced ? '— 保持平衡 —' : G.fogActive ? '— 感知受阻 —' : `— 失衡 ${G.angle.toFixed(0)}° —`;
}

function updateCooldownUI(dt) {
    for (let i = 0; i < 4; i++) {
        if (!G.activeSkills[i]) continue;
        if (G.activeCds[i] > 0) {
            G.activeCds[i] = Math.max(0, G.activeCds[i] - dt);
            const ratio = G.activeCds[i] / G.activeCdMaxs[i];
            slotCdOvs[i].style.transform = `scaleY(${ratio})`;
            slotCdTexts[i].textContent = G.activeCds[i] > 0 ? G.activeCds[i].toFixed(1) : '';
            slotBtns[i].classList.add('on-cooldown');
        } else {
            slotCdOvs[i].style.transform = 'scaleY(0)';
            slotCdTexts[i].textContent = '';
            slotBtns[i].classList.remove('on-cooldown');
        }
    }
}

// ============================================================
// 日志
// ============================================================
function addLog(text, cls = 'system') {
    const div = document.createElement('div');
    div.className = `log-entry ${cls}`;
    div.textContent = text;
    logMessages.prepend(div);
    if (logMessages.children.length > 30) logMessages.removeChild(logMessages.lastChild);
}

// ============================================================
// 敌人系统
// ============================================================
function startWave() {
    const def = ENEMIES[Math.min(G.waveIndex, ENEMIES.length - 1)];
    G.enemy = { ...def, hp: def.maxHp + G.waveIndex * 30, maxHp: def.maxHp + G.waveIndex * 30 };
    G.enemySkillTimer = G.enemy.skillInterval;
    enemyName.textContent = G.enemy.name;
    speakEnemy(G.enemy.lines[0]);
    addLog(`—— 第 ${G.waveIndex + 1} 波: ${G.enemy.name} ——`, 'system');
}

function speakEnemy(line) {
    enemySpeech.textContent = line;
}

function enemyAttack(dt) {
    if (!G.enemy) return;
    G.enemySkillTimer -= dt * 1000;
    if (G.enemySkillTimer > 0) return;
    G.enemySkillTimer = G.enemy.skillInterval * (0.8 + Math.random() * 0.4);

    const skill = G.enemy.skills[Math.floor(Math.random() * G.enemy.skills.length)];
    applyEnemySkill(skill);

    const line = G.enemy.lines[Math.floor(Math.random() * G.enemy.lines.length)];
    speakEnemy(line);
    enemyDialog.classList.add('attacking');
    setTimeout(() => enemyDialog.classList.remove('attacking'), 800);
}

function applyEnemySkill(skill) {
    switch(skill) {
        case 'gravity_shift':
            G.angularVel += (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 6);
            addLog('敌人施放 重力偏移！', 'hurt');
            break;
        case 'reverse_control':
            G.controlReversed = true;
            addLog('敌人施放 操控反转！手感失调...', 'hurt');
            setTimeout(() => { G.controlReversed = false; addLog('操控已恢复', 'system'); }, 4000);
            break;
        case 'pulse':
            G.angularVel += (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 10);
            addLog('敌人施放 脉冲冲击！', 'hurt');
            app.classList.add('shake');
            setTimeout(() => app.classList.remove('shake'), 300);
            break;
        case 'fog':
            G.fogActive = true;
            addLog('敌人施放 感知迷雾！视角受阻...', 'hurt');
            setTimeout(() => { G.fogActive = false; addLog('视野恢复', 'system'); }, 5000);
            break;
    }
}

// ============================================================
// 主动技能
// ============================================================
function useActiveSkill(slot) {
    const s = G.activeSkills[slot];
    if (!s || G.activeCds[slot] > 0) return;
    G.activeCds[slot] = s.cd;
    G.activeCdMaxs[slot] = s.cd;
    addLog(`[${slot+1}] 使用: ${s.name}`, 'skill');

    switch(s.id) {
        case 'reset':
            G.angle = 0; G.angularVel = 0;
            addLog('平衡木强制归零！', 'skill');
            break;
        case 'reflect':
            if (G.enemy && Math.abs(G.angle) > G.balanceThreshold) {
                const dmg = Math.abs(G.angle) * 2;
                G.enemy.hp = Math.max(0, G.enemy.hp - dmg);
                addLog(`反弹！造成 ${dmg.toFixed(0)} 点伤害`, 'skill');
            }
            G.angularVel *= -0.5;
            break;
        case 'slow':
            G.tiltSpeed = 0.5;
            G.activeEffectTimer = 3;
            addLog('时间膨胀激活！3秒内倾斜减缓', 'skill');
            break;
        case 'entropy':
            if (G.playerHp > 20 && G.enemy) {
                const cost = G.playerMaxHp * 0.2;
                G.playerHp -= cost;
                const dmg = 80 + G.waveIndex * 15;
                G.enemy.hp = Math.max(0, G.enemy.hp - dmg);
                addLog(`熵爆！失去 ${cost.toFixed(0)}HP，造成 ${dmg} 伤害`, 'skill');
            }
            break;
    }
}

// ============================================================
// 肉鸽强化
// ============================================================
function showRoguelike() {
    G.phase = 'roguelike';
    overlay.classList.remove('hidden');
    roguePanel.classList.remove('hidden');
    gameoverPanel.classList.add('hidden');

    // 随机抽 3 张牌（被动+主动混合）
    const all = [...PASSIVE_POOL, ...ACTIVE_POOL];
    const ownedIds = [...G.passives.map(p => p.id), ...G.activeSkills.filter(Boolean).map(s => s.id)];
    const pool = all.filter(c => !ownedIds.includes(c.id));
    const picks = shuffle(pool).slice(0, 3);

    cardRow.innerHTML = '';
    picks.forEach(card => {
        const el = document.createElement('div');
        el.className = 'rogue-card';
        el.innerHTML = `
            <div class="card-icon">${card.icon}</div>
            <div class="card-type">${card.type === 'passive' ? '被动强化' : '主动技能'}</div>
            <div class="card-name">${card.name}</div>
            <div class="card-desc">${card.desc}</div>
        `;
        el.addEventListener('click', () => pickCard(card));
        cardRow.appendChild(el);
    });
}

function pickCard(card) {
    if (card.type === 'passive') {
        G.passives.push(card);
        applyPassive(card.id);
        addLog(`获得被动: ${card.icon} ${card.name}`, 'skill');

        const tag = document.createElement('div');
        tag.className = 'passive-tag';
        tag.textContent = `${card.icon} ${card.name}`;
        passiveList.appendChild(tag);
    } else {
        // 找到第一个空槽
        let slot = G.activeSkills.indexOf(null);
        if (slot === -1) slot = 3; // 满了就覆盖最后一个
        G.activeSkills[slot] = card;
        G.activeCds[slot] = 0;
        slotIcons[slot].textContent = card.icon;
        slotNames[slot].textContent = card.name;
        slotBtns[slot].classList.remove('disabled');
        addLog(`获得主动 [${slot+1}]: ${card.icon} ${card.name}`, 'skill');
    }

    overlay.classList.add('hidden');
    roguePanel.classList.add('hidden');
    G.waveIndex++;
    G.phase = 'battle';
    startWave();
}

function applyPassive(id) {
    switch(id) {
        case 'iron_bone':  G.damageReduction = (G.damageReduction || 0) + 0.4; break;
        case 'inertia':    G.tiltSpeedBase   = (G.tiltSpeedBase || 1) * 0.75; break;
        case 'resonance':  G.dpsMultiplier   = (G.dpsMultiplier || 1) * 1.4;  break;
        case 'drain':      G.drainRate       = (G.drainRate || 0) + 2;         break;
        case 'wide_bal':   G.balanceThreshold += 8; break;
    }
}

// ============================================================
// 游戏结束
// ============================================================
function triggerGameOver() {
    G.phase = 'gameover';
    overlay.classList.remove('hidden');
    roguePanel.classList.add('hidden');
    gameoverPanel.classList.remove('hidden');
    finalWave.textContent = G.waveIndex + 1;
    addLog('—— 心神崩溃 ——', 'hurt');
}

function restartGame() {
    Object.assign(G, {
        angle: 0, angularVel: 0, gravityMult: 1,
        tiltSpeed: 1, tiltSpeedBase: 1,
        controlReversed: false, fogActive: false,
        balanceThreshold: 15,
        playerHp: 100, playerMaxHp: 100,
        passives: [],
        activeSkills: [null, null, null, null],
        activeCds: [0, 0, 0, 0],
        activeCdMaxs: [0, 0, 0, 0],
        activeEffectTimer: 0,
        waveIndex: 0, enemy: null, enemySkillTimer: 0,
        phase: 'battle', lastTime: 0,
        damageReduction: 0, dpsMultiplier: 1, drainRate: 0,
    });
    passiveList.innerHTML = '';
    logMessages.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        slotIcons[i].textContent = '—';
        slotNames[i].textContent = '空';
        slotBtns[i].classList.add('disabled');
        slotCdOvs[i].style.transform = 'scaleY(0)';
        slotCdTexts[i].textContent = '';
    }
    overlay.classList.add('hidden');
    gameoverPanel.classList.add('hidden');
    startWave();
}

// ============================================================
// 主循环
// ============================================================
function gameLoop(ts) {
    const dt = Math.min((ts - (G.lastTime || ts)) / 1000, 0.05);
    G.lastTime = ts;

    if (G.phase === 'battle') {
        // --- 平衡木物理 ---
        const tilt = (G.tiltSpeedBase || 1) * (G.tiltSpeed || 1);
        const gravity = 2 * tilt;    // 微弱的不稳定力（越偏越难回）
        G.angularVel += G.angle * gravity * dt;
        G.angularVel *= 0.92;        // 较强阻尼，让摆动快速衰减

        // 自然微扰（增加趣味性）
        G.angularVel += (Math.random() - 0.5) * 3 * dt;

        // 玩家输入（足够强力来对抗倾斜）
        let input = 0;
        if (keys['a'] || keys['arrowleft'])  input -= 1;
        if (keys['d'] || keys['arrowright']) input += 1;
        if (G.controlReversed) input *= -1;
        G.angularVel -= input * 180 * dt;

        G.angle += G.angularVel * dt;
        G.angle = Math.max(-80, Math.min(80, G.angle));

        // 主动技能效果计时
        if (G.activeEffectTimer > 0) {
            G.activeEffectTimer -= dt;
            if (G.activeEffectTimer <= 0) {
                G.tiltSpeed = 1;
                addLog('时间膨胀结束', 'system');
            }
        }

        const balanced = Math.abs(G.angle) < G.balanceThreshold;

        // --- 伤害计算 ---
        if (balanced && G.enemy) {
            const dps = (5 + G.waveIndex * 2) * (G.dpsMultiplier || 1);
            G.enemy.hp = Math.max(0, G.enemy.hp - dps * dt);
            if (G.drainRate) G.playerHp = Math.min(G.playerMaxHp, G.playerHp + G.drainRate * dt);
        } else if (!balanced) {
            const rawDmg = (Math.abs(G.angle) / G.balanceThreshold) * 8 * dt;
            const dmg = rawDmg * (1 - (G.damageReduction || 0));
            G.playerHp = Math.max(0, G.playerHp - dmg);
        }

        // --- 敌人行动 ---
        enemyAttack(dt);
        updateCooldownUI(dt);

        // --- 状态检查 ---
        if (G.playerHp <= 0) { triggerGameOver(); }
        else if (G.enemy && G.enemy.hp <= 0) {
            addLog(`${G.enemy.name} 已消散`, 'dmg');
            G.enemy = null;
            showRoguelike();
        }
    }

    // --- 绘制 ---
    drawBalance();
    drawGlitch();
    updateHUD();

    requestAnimationFrame(gameLoop);
}

// ============================================================
// 工具
// ============================================================
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ============================================================
// 启动
// ============================================================
startWave();
requestAnimationFrame(gameLoop);
