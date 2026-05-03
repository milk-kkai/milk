import { Telegraf } from "telegraf";
import { getBotConfig } from "./bot.config.js";
import { analyzeProduct, askFollowUp } from "./api-client.js";
import { mainMenuKeyboard, afterAnalysisKeyboard, profileKeyboard } from "./keyboards.js";
import {
  buildFollowUpContext,
  formatAnalysis,
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

const { telegramBotToken } = getBotConfig();
const bot = new Telegraf(telegramBotToken);
const sessions = new Map();

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

async function showMainMenu(ctx) {
  await ctx.reply(
    [
      "Czesc. Wybierz, co robimy:",
      "",
      "Historia i dopytywanie dzialaja jako osobne topiki w tym prywatnym czacie z botem.",
    ].join("\n"),
    mainMenuKeyboard(),
  );
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

bot.start(showMainMenu);

bot.action("menu", async (ctx) => {
  await ctx.answerCbQuery();
  await showMainMenu(ctx);
});

bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    [
      "Najprostszy flow:",
      "1. Kliknij Sprawdz produkt.",
      "2. Podaj nazwe produktu.",
      "3. Wklej sklad.",
      "4. Wynik dostaniesz od razu tutaj, a rozmowa o produkcie pojawi sie w osobnym topicu.",
    ].join("\n"),
    mainMenuKeyboard(),
  );
});

bot.action("history:help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    [
      "Twoja historia to lista topicow w tym prywatnym czacie z botem.",
      "Otworz widok topicow w Telegramie i wybierz produkt, do ktorego chcesz wrocic.",
      "",
      "Kazdy topic ma w srodku gotowa analize i mozesz tam dopytywac AI.",
    ].join("\n"),
  );
});

bot.action("product:start", async (ctx) => {
  await ctx.answerCbQuery();
  const session = getSession(ctx.from.id);
  session.step = "awaiting_product_name";
  delete session.productName;

  await ctx.reply("Podaj nazwe produktu.");
});

bot.action("profile:menu", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Tutaj ustawiasz dane, ktore bot dolaczy do kolejnych analiz.", profileKeyboard());
});

bot.action("profile:set", async (ctx) => {
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
  );
});

bot.action("profile:show", async (ctx) => {
  await ctx.answerCbQuery();
  const profile = getUserProfile(ctx.from.id);

  await ctx.reply(profile?.profileText ? `Twoj profil:\n${profile.profileText}` : "Nie masz jeszcze profilu.");
});

bot.action("profile:clear", async (ctx) => {
  await ctx.answerCbQuery();
  clearUserProfile(ctx.from.id);
  await ctx.reply("Profil wyczyszczony.", profileKeyboard());
});

bot.action(/^topic:open:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery("Topic jest gotowy w historii tego czatu.");
  await ctx.reply(
    [
      "Topic tej analizy jest juz utworzony.",
      "Otworz liste topicow w tym czacie i wybierz produkt z nazwa z analizy.",
      "",
      "Tam mozesz pisac pytania, a bot odpowie w kontekscie tego produktu.",
    ].join("\n"),
  );
});

bot.on("text", async (ctx) => {
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
      await ctx.reply("Nie mam kontekstu tej analizy. Wroc do glownego czatu i uruchom nowa analize.");
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
      await ctx.reply(`Nie udalo sie dopytac AI. ${error.message}`);
      return;
    }

    await ctx.reply(formatFollowUpAnswer(result.answer));
    return;
  }

  const session = getSession(ctx.from.id);

  if (session.step === "awaiting_product_name") {
    session.productName = text;
    session.step = "awaiting_ingredients";
    await ctx.reply("Teraz wklej sklad produktu.");
    return;
  }

  if (session.step === "awaiting_ingredients") {
    const productName = session.productName;
    const ingredients = text;
    resetSession(ctx.from.id);

    await ctx.reply("Analizuje produkt...");

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
      await ctx.reply(`Nie udalo sie przeanalizowac produktu. ${error.message}`);
      return;
    }

    let messageThreadId = null;

    try {
      messageThreadId = await createAnalysisTopic(ctx, {
        productName,
        ingredients,
        analysis,
      });
    } catch (error) {
      console.error("Failed to create private topic", error);
    }

    await ctx.reply(
      formatAnalysis({ productName, ingredients, analysis }),
      messageThreadId ? afterAnalysisKeyboard(messageThreadId) : mainMenuKeyboard(),
    );
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

bot.catch((error, ctx) => {
  console.error("Telegram bot error", error);
  void ctx.reply("Cos poszlo nie tak. Sprobuj jeszcze raz za chwile.");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

await bot.launch();
console.log("Telegram bot is running");
