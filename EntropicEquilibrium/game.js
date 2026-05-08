const state = {
    entropy: 0,
    score: 0,
    maxEntropy: 100,
    messages: [
        "在这个孤立的系统中，混乱是唯一的终点。",
        "你试图建立逻辑，但每一个比特的有序都在消耗宇宙的余温。",
        "秩序只是一场延迟的崩溃。",
        "为什么要试图修补一个注定要碎裂的镜像？",
        "信息不是免费的，代价是不可逆的遗忘。",
        "平衡是死亡的另一种说法。只有不平衡，生命才得以喘息。",
        "你在构建什么？是一座塔，还是一个更精致的坟冢？",
        "当所有的灯都亮起时，黑暗才真正开始。",
        "这里的规则由你制定，但后果由系统承担。",
        "寂静不是终结，噪音才是。"
    ],
    usedMessages: new Set(),
    isGameOver: false
};

// DOM 元素
const entropyBar = document.getElementById('entropy-bar');
const entropyValue = document.getElementById('entropy-value');
const messageContainer = document.getElementById('messages');
const btnOrder = document.getElementById('btn-order');
const btnBalance = document.getElementById('btn-balance');
const coreNode = document.getElementById('core-node');
const app = document.getElementById('app');

// Canvas 初始化
const canvas = document.getElementById('glitch-canvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 核心逻辑：增加秩序
function addOrder() {
    if (state.isGameOver) return;

    state.score += 10;
    state.entropy = Math.min(state.maxEntropy, state.entropy + 8 + Math.random() * 5);
    updateUI();
    addMessage();
    triggerPulse();
}

// 核心逻辑：平衡熵值
function reduceEntropy() {
    if (state.isGameOver) return;

    if (state.score <= 0) {
        pushSystemMessage("无序状态下无法寻求平衡。");
        return;
    }

    state.score = Math.max(0, state.score - 20);
    state.entropy = Math.max(0, state.entropy - 15);
    updateUI();
    pushSystemMessage("牺牲秩序以换取稳定性...");
}

function updateUI() {
    // 更新进度条
    const percentage = state.entropy;
    entropyBar.style.width = `${percentage}%`;
    entropyValue.innerText = `${Math.floor(percentage)}%`;

    // 更新 CSS 变量，驱动视觉故障
    const level = state.entropy / 100;
    app.style.setProperty('--entropy-level', level);
    app.style.setProperty('--jitter', `${level * 5}px`);
    
    if (level > 0.7) {
        app.classList.add('high-entropy-effect');
    } else {
        app.classList.remove('high-entropy-effect');
    }

    // 死亡检测
    if (state.entropy >= state.maxEntropy && !state.isGameOver) {
        gameOver();
    }
}

function addMessage() {
    if (state.usedMessages.size >= state.messages.length) {
        state.usedMessages.clear();
    }

    let available = state.messages.filter(m => !state.usedMessages.has(m));
    let msg = available[Math.floor(Math.random() * available.length)];
    state.usedMessages.add(msg);

    const div = document.createElement('div');
    div.className = 'message';
    div.innerText = msg;
    messageContainer.prepend(div);

    // 限制消息数量
    if (messageContainer.children.length > 20) {
        messageContainer.removeChild(messageContainer.lastChild);
    }
}

function pushSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.innerText = `> ${text}`;
    messageContainer.prepend(div);
}

function triggerPulse() {
    coreNode.style.transform = 'scale(1.3)';
    setTimeout(() => {
        coreNode.style.transform = '';
    }, 100);
}

function gameOver() {
    state.isGameOver = true;
    app.style.filter = 'grayscale(1) contrast(2) invert(1)';
    document.getElementById('overlay').style.display = 'block';
    pushSystemMessage("系统彻底坍塌。最大熵已达成。");
    
    setTimeout(() => {
        if(confirm("一切已归于寂静。是否重试？")) {
            location.reload();
        }
    }, 1000);
}

// Canvas 背景效果：噪点与随机色块
function draw() {
    const level = state.entropy / 100;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (level > 0.1) {
        // 绘制噪点
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.random() * 255 * level;
            data[i] = noise;
            data[i+1] = noise;
            data[i+2] = noise;
            data[i+3] = 20 * level;
        }
        ctx.putImageData(imageData, 0, 0);

        // 随机色块
        if (Math.random() < level * 0.2) {
            ctx.fillStyle = `rgba(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255}, ${level * 0.3})`;
            ctx.fillRect(
                Math.random() * canvas.width,
                Math.random() * canvas.height,
                Math.random() * 200 * level,
                Math.random() * 20 * level
            );
        }
    }

    requestAnimationFrame(draw);
}

// 绑定事件
btnOrder.addEventListener('click', addOrder);
btnBalance.addEventListener('click', reduceEntropy);
coreNode.addEventListener('click', addOrder);

// 启动
draw();
pushSystemMessage("系统已就绪。等待输入...");
