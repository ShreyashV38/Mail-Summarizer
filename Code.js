// Config
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID_HERE";
const DIGEST_HOUR = 20;
const WEBAPP_URL = "YOUR_WEBAPP_URL_HERE";

// Checks unread emails every 5 min, sends urgent ones instantly, queues normal ones for 8 PM
function checkMail() {
  var label = GmailApp.getUserLabelByName("Processed");
  if (!label) label = GmailApp.createLabel("Processed");

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("startTime")) {
    markAllExistingAsProcessed(label);
    props.setProperty("startTime", new Date().toISOString());
    return;
  }

  var threads = GmailApp.search("is:unread -label:Processed");
  var limit = Math.min(threads.length, 5);

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
      var summary = result.replace(/URGENT\s*/i, "").replace(/NORMAL\s*/i, "").trim();

      if (isUrgent) {
        var msg = "[URGENT]\n\n" +
          "From: " + sender + "\n" +
          "Subject: " + subject + "\n" +
          "Attachments: " + attachmentNames + "\n" +
          "Time: " + time + "\n\n" +
          "Summary: " + summary;
        sendTelegram(msg);
      } else {
        saveDigestItem({
          sender: sender,
          subject: subject,
          summary: summary,
          attached: attachmentNames,
          time: time
        });
      }

      Utilities.sleep(2000);
    }

    threads[i].addLabel(label);
  }
}

// Marks all existing unread emails as processed on first run
function markAllExistingAsProcessed(label) {
  var threads = GmailApp.search("is:unread -label:Processed");
  for (var i = 0; i < threads.length; i++) {
    threads[i].addLabel(label);
  }
}

// Uses Gemini to classify and summarize an email
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
    contents: [{ parts: [{ text: prompt }] }]
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
    }
    Logger.log("Gemini response: " + response.getContentText());
    return "NORMAL — could not classify (Gemini error)";
  } catch (e) {
    Logger.log("Gemini error: " + e.message);
    return "NORMAL — could not classify (API error)";
  }
}

// Sends a message via Telegram Bot API
function sendTelegram(message) {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    }),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log("Telegram error: " + e.message);
  }
}

// Adds a normal email to the digest queue
function saveDigestItem(item) {
  var props = PropertiesService.getScriptProperties();
  var existing = JSON.parse(props.getProperty("digestQueue") || "[]");
  existing.push(item);
  props.setProperty("digestQueue", JSON.stringify(existing));
}

// Sends all queued normal emails as a digest at 8 PM, then clears the queue
function sendDailyDigest() {
  var props = PropertiesService.getScriptProperties();
  var items = JSON.parse(props.getProperty("digestQueue") || "[]");
  if (items.length === 0) return;

  var msg = "Daily Digest — " + items.length + " email(s)\n";

  for (var i = 0; i < items.length; i++) {
    msg += "\n---\n" +
      "From: " + items[i].sender + "\n" +
      "Subject: " + items[i].subject + "\n" +
      "Attachments: " + items[i].attached + "\n" +
      "Time: " + items[i].time + "\n" +
      "Summary: " + items[i].summary + "\n";
  }

  var chunks = splitMessage(msg, 4000);
  for (var c = 0; c < chunks.length; c++) {
    sendTelegram(chunks[c]);
    Utilities.sleep(500);
  }

  props.setProperty("digestQueue", "[]");
}

// Handles incoming Telegram bot commands via webhook
function pollTelegramUpdates() {
  var props = PropertiesService.getScriptProperties();
  var offset = parseInt(props.getProperty("tgOffset") || "0");

  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/getUpdates?timeout=0&offset=" + offset;
  
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(response.getContentText());
    
    if (!data.ok || data.result.length === 0) return;

    for (var i = 0; i < data.result.length; i++) {
      var update = data.result[i];
      var message = update.message;
      
      if (message && message.text) {
        var chatId = String(message.chat.id);
        if (chatId === TELEGRAM_CHAT_ID) {
          var text = message.text.split("@")[0].toLowerCase().trim();
          
          if (text === "/whatsup") {
            sendDigestNow();
          } else if (text === "/status") {
            var queue = JSON.parse(props.getProperty("digestQueue") || "[]");
            var startTime = props.getProperty("startTime") || "not initialized";
            sendTelegram("Status: Active\nRunning since: " + startTime + "\nQueued: " + queue.length);
          } else if (text === "/help") {
            sendTelegram("Commands:\n/whatsup - Get queued emails\n/status - Check status\n/help - Show this");
          }
        }
      }
      
      props.setProperty("tgOffset", String(update.update_id + 1));
    }
  } catch (e) {
    Logger.log("Poll error: " + e.message);
  }
}

// Sends the current digest queue on demand without clearing it
function sendDigestNow() {
  var props = PropertiesService.getScriptProperties();
  var items = JSON.parse(props.getProperty("digestQueue") || "[]");

  if (items.length === 0) {
    sendTelegram("No normal emails queued.");
    return;
  }

  var msg = "Queued Emails — " + items.length + " email(s)\n";

  for (var i = 0; i < items.length; i++) {
    msg += "\n---\n" +
      "From: " + items[i].sender + "\n" +
      "Subject: " + items[i].subject + "\n" +
      "Attachments: " + items[i].attached + "\n" +
      "Time: " + items[i].time + "\n" +
      "Summary: " + items[i].summary + "\n";
  }

  var chunks = splitMessage(msg, 4000);
  for (var c = 0; c < chunks.length; c++) {
    sendTelegram(chunks[c]);
    Utilities.sleep(500);
  }
}

// Creates time-based triggers — run once during setup
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  ScriptApp.newTrigger("checkMail").timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger("sendDailyDigest").timeBased().atHour(DIGEST_HOUR).everyDays(1).create();
  ScriptApp.newTrigger("pollTelegramUpdates").timeBased().everyMinutes(1).create();
}

// Registers Telegram webhook using the deployed web app URL
function setWebhook() {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook?url=" + encodeURIComponent(WEBAPP_URL);
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var result = response.getContentText();
  Logger.log("setWebhook response: " + result);
  sendTelegram("Webhook registered: " + result);
}

// Clears all stored data and re-marks old emails — run if old emails got processed
function resetScript() {
  var props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();

  var label = GmailApp.getUserLabelByName("Processed");
  if (!label) label = GmailApp.createLabel("Processed");

  var threads = GmailApp.search("-label:Processed");
  for (var i = 0; i < threads.length; i++) {
    threads[i].addLabel(label);
  }

  props.setProperty("startTime", new Date().toISOString());
  props.setProperty("digestQueue", "[]");
  sendTelegram("Script reset complete. Only new emails from now will be processed.");
}

// Splits long messages to stay within Telegram's character limit
function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  var chunks = [];
  while (text.length > 0) {
    // Ensure we don't create empty strings
    if (text.length <= maxLen) {
      chunks.push(text);
      break;
    }
    var splitAt = text.lastIndexOf("\n", maxLen);
    // If no newline found, force split at maxLen
    if (splitAt === -1 || splitAt === 0) splitAt = maxLen;
    
    chunks.push(text.substring(0, splitAt));
    text = text.substring(splitAt);
  }
  return chunks;
}
function deleteWebhook() {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/deleteWebhook";
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(r.getContentText());
}
// Verifies Telegram bot connection
function testTelegram() {
  sendTelegram("MailGuard is connected.");
}