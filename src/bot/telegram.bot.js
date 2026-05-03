import { Telegraf } from "telegraf";
import { getBotConfig } from "./bot.config.js";
import { analyzeProduct, askFollowUp } from "./api-client.js";
import {
  mainMenuKeyboard,
  profileKeyboard,
} from "./keyboards.js";
import {
  buildFollowUpContext,
  formatFollowUpAnswer,
  formatTopicIntro,
  safeTopicName,
} from "./message-formatters.js";
import {
  clearUserProfile,
  getTopicContext,
  getUserProfile,
  saveTopicContext,
  saveUserProfile,
} from "./local-store.js";

const { telegramBotToken, telegramWebhookSecret, telegramWebhookUrl } = getBotConfig();
export const telegramBot = new Telegraf(telegramBotToken);
const sessions = new Map();
export const BOT_VERSION = "telegram-bot-2026-05-03-webhook-v1";

function getSession(userId) {
  const key = String(userId);
  const session = sessions.get(key) ?? {};
  sessions.set(key, session);
  return session;
}

function resetSession(userId) {
  sessions.delete(String(userId));
}

function isPrivateChat(ctx) {
  return ctx.chat?.type === "private";
}

function isTopicMessage(ctx) {
  return isPrivateChat(ctx) && Number.isInteger(ctx.message?.message_thread_id);
}

function profileToUserProfile(profile) {
  if (!profile?.profileText) {
    return {};
  }

  return {
    notes: profile.profileText,
  };
}

function describeTelegramError(error) {
  const description =
    error?.description ||
    error?.response?.description ||
    error?.message ||
    "Unknown Telegram error";
  const code = error?.code || error?.response?.error_code || "unknown";

  return { code, description };
}

function topicSetupHelp(error) {
  const { code, description } = describeTelegramError(error);
  const lowerDescription = description.toLowerCase();

  if (
    lowerDescription.includes("not a forum") ||
    lowerDescription.includes("topic") ||
    lowerDescription.includes("thread")
  ) {
    return [
      "Analiza jest gotowa, ale Telegram nie pozwolil utworzyc topicu.",
      "",
      `Telegram error: ${code} ${description}`,
      "",
      "Najczestsza przyczyna: dla bota nie jest wlaczony Threaded Mode.",
      "Naprawa:",
      "1. Otworz @BotFather.",
      "2. Wejdz w mini-app / panel zarzadzania botem.",
      "3. Wybierz tego bota.",
      "4. Wlacz Threaded Mode / Topics for private chats.",
      "5. Zapisz zmiany i zrob nowa analize.",
    ].join("\n");
  }

  return [
    "Analiza jest gotowa, ale nie udalo sie utworzyc topicu.",
    "",
    `Telegram error: ${code} ${description}`,
  ].join("\n");
}

async function showMainMenu(ctx) {
  await ctx.reply(
    [
      "Czesc. Wybierz, co robimy:",
      "",
      "Analiza pojawi sie w osobnym topicu produktu. Tutaj zostawiam menu i status.",
    ].join("\n"),
    mainMenuKeyboard(),
  );
}

async function startProductFlow(ctx) {
  const session = getSession(ctx.from.id);
  session.step = "awaiting_product_name";
  delete session.productName;

  await ctx.reply("Podaj nazwe produktu.");
}

async function showHelp(ctx) {
  await ctx.reply(
    [
      "Najprostszy flow:",
      "1. Wybierz /new_product z menu.",
      "2. Podaj nazwe produktu.",
      "3. Wklej sklad.",
      "4. Pelna analiza pojawi sie tylko w topicu produktu.",
      "5. W topicu mozesz od razu dopytywac AI.",
    ].join("\n"),
  );
}

async function showProfileMenu(ctx) {
  await ctx.reply("Tutaj ustawiasz dane, ktore bot dolaczy do kolejnych analiz.", profileKeyboard());
}

async function createAnalysisTopic(ctx, { productName, ingredients, analysis }) {
  const topic = await ctx.telegram.callApi("createForumTopic", {
    chat_id: ctx.chat.id,
    name: safeTopicName(productName),
  });

  const messageThreadId = topic.message_thread_id;
  const context = buildFollowUpContext({ productName, ingredients, analysis });

  saveTopicContext({
    chatId: ctx.chat.id,
    messageThreadId,
    context,
  });

  await ctx.telegram.sendMessage(
    ctx.chat.id,
    formatTopicIntro({ productName, ingredients, analysis }),
    {
      message_thread_id: messageThreadId,
    },
  );

  return messageThreadId;
}

telegramBot.start(showMainMenu);

telegramBot.command("new_product", startProductFlow);
telegramBot.command("health", showProfileMenu);
telegramBot.command("help", showHelp);
telegramBot.command("version", async (ctx) => {
  await ctx.reply(BOT_VERSION);
});

telegramBot.action("menu", async (ctx) => {
  await ctx.answerCbQuery();
  await showMainMenu(ctx);
});

telegramBot.action("help", async (ctx) => {
  await ctx.answerCbQuery();
  await showHelp(ctx);
});

telegramBot.action("history:help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    [
      "Twoja historia to lista topicow w tym prywatnym czacie z botem.",
      "Otworz widok topicow w Telegramie i wybierz produkt, do ktorego chcesz wrocic.",
      "",
      "Kazdy topic ma pelna analize i sluzy do dopytywania AI o konkretny produkt.",
    ].join("\n"),
    mainMenuKeyboard(),
  );
});

telegramBot.command("topic_debug", async (ctx) => {
  if (!isPrivateChat(ctx)) {
    return;
  }

  try {
    const me = await ctx.telegram.getMe();
    await ctx.reply(
      [
        "Diagnostyka topicow:",
        `Bot: @${me.username}`,
        `allows_users_to_create_topics: ${String(me.allows_users_to_create_topics)}`,
        "",
        "Jesli wartosc jest false albo topic testowy sie nie tworzy, wlacz Threaded Mode w @BotFather.",
      ].join("\n"),
    );

    const topic = await ctx.telegram.callApi("createForumTopic", {
      chat_id: ctx.chat.id,
      name: safeTopicName("Test topic"),
    });

    await ctx.telegram.sendMessage(ctx.chat.id, "Topic testowy dziala.", {
      message_thread_id: topic.message_thread_id,
    });
    await ctx.reply(`Topic testowy utworzony: ${topic.message_thread_id}`);
  } catch (error) {
    console.error("Topic debug failed", error);
    await ctx.reply(topicSetupHelp(error));
  }
});

telegramBot.action("product:start", async (ctx) => {
  await ctx.answerCbQuery();
  await startProductFlow(ctx);
});

telegramBot.action("profile:menu", async (ctx) => {
  await ctx.answerCbQuery();
  await showProfileMenu(ctx);
});

telegramBot.action("profile:set", async (ctx) => {
  await ctx.answerCbQuery();
  const session = getSession(ctx.from.id);
  session.step = "awaiting_profile";

  await ctx.reply(
    [
      "Wklej swoje preferencje zdrowotne jednym tekstem.",
      "",
      "Przyklad:",
      "Alergie: laktoza, orzechy",
      "Choroby: insulinoopornosc",
      "Cele: mniej cukru, wiecej bialka",
    ].join("\n"),
    profileKeyboard(),
  );
});

telegramBot.action("profile:show", async (ctx) => {
  await ctx.answerCbQuery();
  const profile = getUserProfile(ctx.from.id);

  await ctx.reply(
    profile?.profileText ? `Twoj profil:\n${profile.profileText}` : "Nie masz jeszcze profilu.",
    profileKeyboard(),
  );
});

telegramBot.action("profile:clear", async (ctx) => {
  await ctx.answerCbQuery();
  clearUserProfile(ctx.from.id);
  await ctx.reply("Profil wyczyszczony.", profileKeyboard());
});

telegramBot.action(/^topic:open:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery("Topic jest gotowy w historii tego czatu.");
  await ctx.reply(
    [
      "Topic tej analizy jest juz utworzony.",
      "Otworz liste topicow w tym czacie i wybierz produkt z nazwa z analizy.",
      "",
      "Tam wpisz pytanie, a bot odpowie w kontekscie tego produktu.",
    ].join("\n"),
    mainMenuKeyboard(),
  );
});

telegramBot.on("text", async (ctx) => {
  if (!isPrivateChat(ctx)) {
    return;
  }

  const text = ctx.message.text.trim();

  if (text.startsWith("/")) {
    return;
  }

  if (isTopicMessage(ctx)) {
    const context = getTopicContext({
      chatId: ctx.chat.id,
      messageThreadId: ctx.message.message_thread_id,
    });

    if (!context) {
      await ctx.reply(
        "Nie mam kontekstu tej analizy. Wroc do glownego czatu i uruchom nowa analize.",
        mainMenuKeyboard(),
      );
      return;
    }

    await ctx.reply("Dopytuje AI o ten produkt...");

    let result;

    try {
      result = await askFollowUp({
        userInput: text,
        context,
      });
    } catch (error) {
      console.error("Follow-up request failed", error);
      await ctx.reply(`Nie udalo sie dopytac AI. ${error.message}`, mainMenuKeyboard());
      return;
    }

    await ctx.reply(formatFollowUpAnswer(result.answer));
    return;
  }

  const session = getSession(ctx.from.id);

  if (session.step === "awaiting_product_name") {
    session.productName = text;
    session.step = "awaiting_ingredients";
    await ctx.reply("Teraz wklej sklad produktu.", mainMenuKeyboard());
    return;
  }

  if (session.step === "awaiting_ingredients") {
    const productName = session.productName;
    const ingredients = text;
    resetSession(ctx.from.id);

    await ctx.sendChatAction("typing");

    const profile = getUserProfile(ctx.from.id);
    let analysis;

    try {
      analysis = await analyzeProduct({
        productName,
        ingredients,
        userProfile: profileToUserProfile(profile),
      });
    } catch (error) {
      console.error("Analyze request failed", error);
      await ctx.reply(`Nie udalo sie przeanalizowac produktu. ${error.message}`, mainMenuKeyboard());
      return;
    }

    let messageThreadId = null;

    try {
      await createAnalysisTopic(ctx, {
        productName,
        ingredients,
        analysis,
      });
      messageThreadId = true;
    } catch (error) {
      console.error("Failed to create private topic", error);
      await ctx.reply(topicSetupHelp(error));
    }

    if (!messageThreadId) {
      await ctx.reply("Analiza jest gotowa, ale nie mam gdzie jej pokazac bez topicu.");
    }

    return;
  }

  if (session.step === "awaiting_profile") {
    saveUserProfile(ctx.from.id, text);
    resetSession(ctx.from.id);
    await ctx.reply("Profil zapisany. Dolacze go do kolejnych analiz.", mainMenuKeyboard());
    return;
  }

  await ctx.reply("Wybierz akcje z menu.", mainMenuKeyboard());
});

telegramBot.catch((error, ctx) => {
  console.error("Telegram bot error", error);
  void ctx.reply("Cos poszlo nie tak. Sprobuj jeszcze raz za chwile.");
});

export function getTelegramWebhookSecret() {
  return telegramWebhookSecret;
}

export async function configureTelegramBotWebhook(logger = console) {
  await telegramBot.telegram.setMyCommands([
    {
      command: "new_product",
      description: "Nowy produkt",
    },
    {
      command: "health",
      description: "Zdrowie i preferencje",
    },
    {
      command: "help",
      description: "Pomoc",
    },
    {
      command: "version",
      description: "Wersja bota",
    },
  ]);

  if (!telegramWebhookUrl) {
    logger.warn?.("TELEGRAM_WEBHOOK_URL is not set; Telegram webhook was not configured");
    return;
  }

  const webhookOptions = {
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  };

  if (telegramWebhookSecret) {
    webhookOptions.secret_token = telegramWebhookSecret;
  }

  await telegramBot.telegram.setWebhook(telegramWebhookUrl, webhookOptions);
  logger.info?.(`Telegram webhook configured: ${telegramWebhookUrl}`);
  logger.info?.(`Telegram bot version: ${BOT_VERSION}`);
}
