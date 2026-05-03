import { Markup } from "telegraf";

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Sprawdz produkt", "product:start")],
    [Markup.button.callback("Moja historia", "history:help")],
    [Markup.button.callback("Zdrowie / Preferencje", "profile:menu")],
    [Markup.button.callback("Pomoc", "help")],
  ]);
}

export function afterAnalysisKeyboard(messageThreadId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Dopytaj o ten produkt", `topic:open:${messageThreadId}`)],
    [Markup.button.callback("Nowy produkt", "product:start")],
    [Markup.button.callback("Menu glowne", "menu")],
  ]);
}

export function afterAnalysisFallbackKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Nowy produkt", "product:start")],
    [Markup.button.callback("Menu glowne", "menu")],
  ]);
}

export function profileKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Ustaw / zmien profil", "profile:set")],
    [Markup.button.callback("Pokaz moj profil", "profile:show")],
    [Markup.button.callback("Wyczysc profil", "profile:clear")],
    [Markup.button.callback("Wroc", "menu")],
  ]);
}
