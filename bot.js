const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

/* ================= CONFIG ================= */

const token = '8421504587:AAGz1qEqi562yPobtcNRewM5c4cqFB95V1c';
const ADMIN_ID = 7973039530; // your Telegram ID
const MIN_WITHDRAW = 500;
const DAILY_REWARD = 50;

/* ================= BOT ================= */

const bot = new TelegramBot(token, { polling: true });

/* ================= DATA DIR ================= */

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const usersFile = path.join(dataDir, 'users.json');
const tasksFile = path.join(dataDir, 'tasks.json');
const withdrawalsFile = path.join(dataDir, 'withdrawals.json');

/* ================= HELPERS ================= */

function loadJSON(file, def) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================= LOAD DATA ================= */

let users = loadJSON(usersFile, {});
let tasks = loadJSON(tasksFile, []);
let withdrawals = loadJSON(withdrawalsFile, []);

/* ================= SAVE HELPERS ================= */

const saveUsers = () => saveJSON(usersFile, users);
const saveTasks = () => saveJSON(tasksFile, tasks);
const saveWithdrawals = () => saveJSON(withdrawalsFile, withdrawals);

/* ================= START ================= */

bot.onText(/\/start(.*)/, (msg, match) => {
  const id = msg.from.id;
  const chatId = msg.chat.id;
  const ref = match[1]?.trim();

  if (!users[id]) {
    users[id] = {
      id,
      balance: 0,
      referrals: 0,
      referredBy: null,
      completedTasks: [],
      lastEarn: 0
    };

    if (ref && users[ref] && ref !== String(id)) {
      users[id].referredBy = ref;
      users[ref].referrals += 1;
      users[ref].balance += 20;
    }

    saveUsers();
  }

  bot.sendMessage(
    chatId,
    `👋 Welcome!\n\n💰 Balance: ${users[id].balance}\n👥 Referrals: ${users[id].referrals}\n\n🔗 Referral Link:\nhttps://t.me/YOUR_BOT_USERNAME?start=${id}`
  );
});

/* ================= DAILY EARN ================= */

bot.onText(/\/earn/, (msg) => {
  const id = msg.from.id;
  const now = Date.now();
  const DAY = 86400000;

  if (now - users[id].lastEarn < DAY) {
    return bot.sendMessage(msg.chat.id, "⏳ You already earned today.");
  }

  users[id].balance += DAILY_REWARD;
  users[id].lastEarn = now;
  saveUsers();

  bot.sendMessage(
    msg.chat.id,
    `🎉 Daily reward claimed!\n+${DAILY_REWARD} coins`
  );
});

/* ================= TASKS ================= */

bot.onText(/\/tasks/, (msg) => {
  if (tasks.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 No tasks available.");
  }

  let text = "🧾 Available Tasks:\n\n";
  tasks.forEach((t, i) => {
    text += `${i + 1}. ${t.title}\n💰 ${t.reward}\n${t.link}\n\n`;
  });

  text += "Claim with:\n/claim TASK_NUMBER";
  bot.sendMessage(msg.chat.id, text);
});

bot.onText(/\/claim (\d+)/, (msg, match) => {
  const id = msg.from.id;
  const index = Number(match[1]) - 1;

  if (!tasks[index]) {
    return bot.sendMessage(msg.chat.id, "❌ Invalid task.");
  }

  if (users[id].completedTasks.includes(index)) {
    return bot.sendMessage(msg.chat.id, "❌ Already claimed.");
  }

  users[id].completedTasks.push(index);
  users[id].balance += tasks[index].reward;
  saveUsers();

  bot.sendMessage(
    msg.chat.id,
    `✅ Task completed!\n💰 +${tasks[index].reward} coins`
  );
});

/* ================= WITHDRAW ================= */

bot.onText(/\/withdraw$/, (msg) => {
  const id = msg.from.id;

  if (users[id].balance < MIN_WITHDRAW) {
    return bot.sendMessage(
      msg.chat.id,
      `❌ Minimum withdrawal is ${MIN_WITHDRAW}`
    );
  }

  bot.sendMessage(
    msg.chat.id,
    "Send in ONE message:\n\nMethod | Amount | Details"
  );

  bot.once('message', (reply) => {
    const parts = reply.text.split('|').map(p => p.trim());
    if (parts.length !== 3) {
      return bot.sendMessage(msg.chat.id, "❌ Invalid format.");
    }

    withdrawals.push({
      userId: id,
      method: parts[0],
      amount: Number(parts[1]),
      details: parts[2],
      status: "pending"
    });

    saveWithdrawals();
    bot.sendMessage(msg.chat.id, "✅ Withdrawal submitted.");
  });
});

/* ================= ADMIN ================= */

bot.onText(/\/admin/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  bot.sendMessage(
    msg.chat.id,
    `🛠 Admin Panel\n\n/addtask\n/withdrawals`
  );
});

/* ================= ADD TASK ================= */

bot.onText(/\/addtask/, (msg) => {
  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "❌ Admin only.");
  }

  bot.sendMessage(
    msg.chat.id,
    "Send task as:\n\nTitle | Link | Reward"
  );

  bot.once('message', (reply) => {
    const parts = reply.text.split('|').map(p => p.trim());

    if (parts.length !== 3) {
      return bot.sendMessage(msg.chat.id, "❌ Invalid format.");
    }

    tasks.push({
      title: parts[0],
      link: parts[1],
      reward: Number(parts[2])
    });

    saveTasks();
    bot.sendMessage(msg.chat.id, "✅ Task added.");
  });
});

/* ================= WITHDRAWALS ================= */

bot.onText(/\/withdrawals$/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  if (withdrawals.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 No withdrawals.");
  }

  let text = "💸 Withdrawals:\n\n";
  withdrawals.forEach((w, i) => {
    text += `${i + 1}. ${w.userId} | ${w.amount} | ${w.status}\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});
