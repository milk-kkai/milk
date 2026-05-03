import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const STORE_PATH = path.join(DATA_DIR, "telegram-bot-store.json");

const EMPTY_STORE = {
  topics: {},
  userProfiles: {},
};

function ensureStoreFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2));
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));

    return {
      topics: parsed.topics && typeof parsed.topics === "object" ? parsed.topics : {},
      userProfiles:
        parsed.userProfiles && typeof parsed.userProfiles === "object"
          ? parsed.userProfiles
          : {},
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}

function writeStore(store) {
  ensureStoreFile();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function topicKey(chatId, messageThreadId) {
  return `${chatId}:${messageThreadId}`;
}

export function saveTopicContext({ chatId, messageThreadId, context }) {
  const store = readStore();
  store.topics[topicKey(chatId, messageThreadId)] = {
    ...context,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
}

export function getTopicContext({ chatId, messageThreadId }) {
  const store = readStore();
  return store.topics[topicKey(chatId, messageThreadId)] ?? null;
}

export function saveUserProfile(userId, profileText) {
  const store = readStore();
  store.userProfiles[String(userId)] = {
    profileText,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
}

export function appendUserProfile(userId, profileText) {
  const store = readStore();
  const key = String(userId);
  const existingProfile = store.userProfiles[key];
  const existingEntries = Array.isArray(existingProfile?.entries)
    ? existingProfile.entries.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const legacyText =
    typeof existingProfile?.profileText === "string" && existingProfile.profileText.trim().length > 0
      ? existingProfile.profileText.trim()
      : "";
  const entries = legacyText && existingEntries.length === 0
    ? [legacyText]
    : existingEntries;
  const nextEntry = profileText.trim();

  if (!nextEntry) {
    return;
  }

  const uniqueEntries = entries.includes(nextEntry) ? entries : [...entries, nextEntry];

  store.userProfiles[key] = {
    entries: uniqueEntries,
    profileText: uniqueEntries.join("\n"),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
}

export function getUserProfile(userId) {
  const store = readStore();
  return store.userProfiles[String(userId)] ?? null;
}

export function clearUserProfile(userId) {
  const store = readStore();
  delete store.userProfiles[String(userId)];
  writeStore(store);
}
