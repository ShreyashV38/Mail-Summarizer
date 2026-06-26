// ============================================================
// CONFIG — Your keys are here
// ============================================================
const GEMINI_API_KEY="YOUR KEY";
const TELEGRAM_BOT_TOKEN = "YOUR TELEGRAM BOT TOKEN";
const TELEGRAM_CHAT_ID   = "YOUR TELEGRAM CHAT ID";
const DIGEST_HOUR        = 20; // 8 PM daily digest
// ============================================================


// ============================================================
// MAIN: checkMail — runs every 5 min via trigger
// ============================================================
function checkMail() {
  var label = GmailApp.getUserLabelByName("Processed");
  var threads = GmailApp.search("is:unread -label:Processed");
  var maxPerRun = 5;
  var limit = Math.min(threads.length, maxPerRun);

  var digestItems = []; // collect NORMAL items for batched digest

  for (var i = 0; i < limit; i++) {
    var messages = threads[i].getMessages();

    for (var j = 0; j < messages.length; j++) {
      var subject = messages[j].getSubject();
      var sender  = messages[j].getFrom();
      var body    = messages[j].getPlainBody().substring(0, 500);

      var attachments = messages[j].getAttachments();
      var attachmentNames = "";
      for (var k = 0; k < attachments.length; k++) {
        attachmentNames += attachments[k].getName() + ", ";
      }
      if (attachmentNames === "") attachmentNames = "none";

      var result = classifyMail(subject, sender, body, attachmentNames);
      var isUrgent = result.toUpperCase().indexOf("URGENT") !== -1;

      Logger.log("From: " + sender);
      Logger.log("Subject: " + subject);
      Logger.log("Gemini says: " + result);
      Logger.log("Urgent: " + isUrgent);
      Logger.log("---");

      if (isUrgent) {
        // ── INSTANT Telegram alert ──
        var urgentMsg = "🚨 *URGENT EMAIL*\n\n" +
          "👤 _" + escapeMarkdown(sender) + "_\n" +
          "📌 *" + escapeMarkdown(subject) + "*\n" +
          "📎 " + attachmentNames + "\n\n" +
          escapeMarkdown(result.replace(/URGENT\s*/i, "").trim());
        sendTelegram(urgentMsg);
      } else {
        // ── Queue for daily digest ──
        var summary = result.replace(/NORMAL\s*/i, "").trim();
        digestItems.push({
          sender:   sender,
          subject:  subject,
          summary:  summary,
          attached: attachmentNames,
          time:     messages[j].getDate().toLocaleString()
        });
      }

      Utilities.sleep(2000); // rate-limit Gemini
    }

    threads[i].addLabel(label);
  }

  // ── Save NORMAL items to persistent storage ──
  if (digestItems.length > 0) {
    saveDigestItems(digestItems);
  }
}


// ============================================================
// GEMINI: classifyMail
// ============================================================
function classifyMail(subject, sender, body, attachments) {
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
    muteHttpExceptions: true // catch errors instead of throwing
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
    chat_id:    TELEGRAM_CHAT_ID,
    text:       message,
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
// DIGEST: persistent storage + daily send
// ============================================================
function saveDigestItems(items) {
  var props    = PropertiesService.getScriptProperties();
  var existing = JSON.parse(props.getProperty("digestQueue") || "[]");
  var merged   = existing.concat(items);
  props.setProperty("digestQueue", JSON.stringify(merged));
  Logger.log("Saved " + items.length + " items to digest queue (total: " + merged.length + ")");
}

function sendDailyDigest() {
  var props = PropertiesService.getScriptProperties();
  var items = JSON.parse(props.getProperty("digestQueue") || "[]");

  if (items.length === 0) {
    Logger.log("No digest items — skipping");
    return;
  }

  var msg = "📬 *Daily Email Digest* (" + items.length + " emails)\n\n";

  for (var i = 0; i < items.length; i++) {
    msg += "─────────────\n" +
      "👤 _" + escapeMarkdown(items[i].sender) + "_\n" +
      "📌 *" + escapeMarkdown(items[i].subject) + "*\n" +
      "📎 " + items[i].attached + "\n" +
      "📝 " + escapeMarkdown(items[i].summary) + "\n" +
      "🕐 " + items[i].time + "\n";
  }

  var chunks = splitMessage(msg, 4000);
  for (var c = 0; c < chunks.length; c++) {
    sendTelegram(chunks[c]);
    Utilities.sleep(500);
  }

  props.setProperty("digestQueue", "[]");
  Logger.log("Digest sent and queue cleared");
}

function setupDigestTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "sendDailyDigest") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("sendDailyDigest")
    .timeBased()
    .atHour(DIGEST_HOUR)
    .everyDays(1)
    .create();
  Logger.log("Digest trigger set for " + DIGEST_HOUR + ":00 daily");
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

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  var chunks = [];
  while (text.length > 0) {
    var splitAt = text.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt > maxLen) splitAt = maxLen;
    chunks.push(text.substring(0, splitAt));
    text = text.substring(splitAt);
  }
  return chunks;
}

// ============================================================
// TEST FUNCTION
// ============================================================
function testTelegram() {
  sendTelegram("✅ MailGuard is alive and connected!");
}