// ============================================================
// CONFIG
// ============================================================
const GEMINI_API_KEY = "YOUR KEY";
const TELEGRAM_BOT_TOKEN = "YOUR TELEGRAM BOT TOKEN";
const TELEGRAM_CHAT_ID = "YOUR TELEGRAM CHAT ID";
// ============================================================


// ============================================================
// MAIN: checkMail — runs every 1 min via trigger
// ============================================================
function checkMail() {
  var label = GmailApp.getUserLabelByName("Processed");
  if (!label) {
    label = GmailApp.createLabel("Processed");
  }

  var threads = GmailApp.search("is:unread -label:Processed");
  var maxPerRun = 5;
  var limit = Math.min(threads.length, maxPerRun);

  for (var i = 0; i < limit; i++) {
    var messages = threads[i].getMessages();

    for (var j = 0; j < messages.length; j++) {
      var subject = messages[j].getSubject();
      var sender = messages[j].getFrom();
      var body = messages[j].getPlainBody().substring(0, 500);
      var time = messages[j].getDate().toLocaleString();

      var attachments = messages[j].getAttachments();
      var attachmentNames = "";
      for (var k = 0; k < attachments.length; k++) {
        attachmentNames += attachments[k].getName() + ", ";
      }
      if (attachmentNames === "") attachmentNames = "none";

      var result = summarizeMail(subject, sender, body, attachmentNames);
      var isUrgent = result.toUpperCase().indexOf("URGENT") !== -1;

      Logger.log("From: " + sender);
      Logger.log("Subject: " + subject);
      Logger.log("Gemini says: " + result);
      Logger.log("---");

      // ── Build and send Telegram message instantly ──
      var emoji = isUrgent ? "🚨" : "📩";
      var tag = isUrgent ? "*URGENT EMAIL*" : "*New Email*";
      var summary = result
        .replace(/URGENT\s*/i, "")
        .replace(/NORMAL\s*/i, "")
        .trim();

      var msg = emoji + " " + tag + "\n\n" +
        "👤 _" + escapeMarkdown(sender) + "_\n" +
        "📌 *" + escapeMarkdown(subject) + "*\n" +
        "📎 " + attachmentNames + "\n" +
        "🕐 " + time + "\n\n" +
        "📝 " + escapeMarkdown(summary);

      sendTelegram(msg);
      Utilities.sleep(2000); // rate-limit Gemini
    }

    threads[i].addLabel(label);
  }
}


// ============================================================
// GEMINI: summarizeMail
// ============================================================
function summarizeMail(subject, sender, body, attachments) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;

  var prompt = "You are an email triage assistant.\n\n" +
    "Email from: " + sender + "\n" +
    "Subject: " + subject + "\n" +
    "Attachments: " + attachments + "\n" +
    "Body: " + body + "\n\n" +
    "Classify this email as URGENT or NORMAL, then give a one-line summary.\n" +
    "Reply in EXACTLY this format — no extra text:\n" +
    "URGENT or NORMAL\n<Brief one-line summary>";

  var payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      Logger.log("Gemini unexpected response: " + JSON.stringify(data));
      return "NORMAL — could not classify (Gemini error)";
    }
  } catch (e) {
    Logger.log("Gemini API error: " + e.message);
    return "NORMAL — could not classify (API error)";
  }
}


// ============================================================
// TELEGRAM: sendTelegram
// ============================================================
function sendTelegram(message) {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";

  var payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown"
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    if (!data.ok) {
      Logger.log("Telegram error: " + JSON.stringify(data));
    } else {
      Logger.log("Telegram message sent successfully");
    }
  } catch (e) {
    Logger.log("Telegram API error: " + e.message);
  }
}


// ============================================================
// SETUP: Run once to create the time-based trigger
// ============================================================
function setupTrigger() {
  // Remove any existing checkMail triggers
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "checkMail") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Run checkMail every 1 minute for near-instant delivery
  ScriptApp.newTrigger("checkMail")
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log("Trigger set: checkMail runs every 1 minute");
}


// ============================================================
// HELPERS
// ============================================================
function escapeMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\").replace(/_/g, "\\_").replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)").replace(/~/g, "\\~").replace(/`/g, "\\`")
    .replace(/>/g, "\\>").replace(/#/g, "\\#").replace(/\+/g, "\\+")
    .replace(/\-/g, "\\-").replace(/\=/g, "\\=").replace(/\|/g, "\\|")
    .replace(/\./g, "\\.").replace(/!/g, "\\!");
}


// ============================================================
// TEST
// ============================================================
function testTelegram() {
  sendTelegram("✅ MailGuard is alive and connected!");
}