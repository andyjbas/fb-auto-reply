'use strict';

const dotenv = require('dotenv');
dotenv.load();

const Promise = require('bluebird');
const fbLogin = Promise.promisify(require("facebook-chat-api"));
const bunyan = require('bunyan');
const SlackStream = require('bunyan-slack');

function appError(err) {
  appLogger.error(err);
}

function slackFormatter(record, level) {
  function formatMsg(m) {
    let timestamp = new Date(m.timestamp).toTimeString();
    return `${timestamp} _${m.senderName}:_ ${m.body}`
  }

  function formatUnreadMsgs(unreadCount, msgs) {
    // lowest index to begin formatting
    const limit = msgs.length - unreadCount;

    return msgs.map(function(msg, index) {
      if (index < limit) { return msg; }
      return `*${msg}*`; // bold
    });
  }

  function formatTimestamp(t) {
    return new Date(t).toTimeString();
  }

  if (level >= bunyan.ERROR) {
    return {icon_emoji: ':boom:', text: `[ERROR] ${record.msg}`};
  }

  let msgs = record.msgHistory;
  let threadName = msgs[msgs.length - 1].senderName;
  let unreadCount = record.thread.unreadCount;

  let msgsHuman = msgs.map(formatMsg);
  msgsHuman = formatUnreadMsgs(unreadCount, msgsHuman);
  msgsHuman = msgsHuman.join('\n');

  let text = '';
  text += `*[${unreadCount} NEW - ${formatTimestamp(record.thread.timestamp)}]*\n\n`;
  text += msgsHuman;

  return {text: text, username: threadName};
}

const appLogger = bunyan.createLogger({
  name: 'global',
  component: 'app',
  streams: [
    {
      level: 'info',
      stream: process.stdout
    },
    {
      level: 'error',
      stream: new SlackStream({
        webhook_url: process.env.SLACK_WEBHOOK,
        channel: process.env.SLACK_CHANNEL,
        username: 'bot',
        icon_emoji: ':boom:'
      })
    }
  ]
});


const threadLogger = appLogger.child({
  streams: [
    {
      level: 'warn',
      stream: new SlackStream({
        webhook_url: process.env.SLACK_WEBHOOK,
        channel: process.env.SLACK_CHANNEL,
        username: 'bot',
        icon_emoji: ':email:',
        customFormatter: slackFormatter
      }, appError)
    }
  ]
});

const fbCreds = {
  email: process.env.FB_USER,
  password: process.env.FB_PASS
}

const fbOpts = {
  logLevel: 'silent'
}

appLogger.info('Attempting facebook login...');
fbLogin(fbCreds, fbOpts).then(function(api) {
  appLogger.info('Facebook login successful...');

  Promise.promisifyAll(api);

  function fetchUnreadMessages(thread) {
    const stopIndex = thread.unreadCount // adds two extra msgs for context
    return api.getThreadHistoryAsync(thread.threadID,
                                     0, stopIndex,
                                     thread.timestamp);
  }

  function logThreadActivity(logger, threadObject) {
    logger.warn(threadObject);
  }

  function markRead(logger, threadId) {
    logger.info('marking thread as read');
    return api.markAsReadAsync(threadId);
  }

  function replyTo(logger, threadId) {
    logger.info('initiating thread reply');
    const text = process.env.AUTO_REPLY || 'Test auto response ...';
    return api.sendMessageAsync(text, threadId);
  }

  api.getThreadListAsync(0, 20) // last 20 threads
    .filter(function(result) {
      return result.unreadCount > 0;
    })

    .map(function(result) {
      return Promise.props({
        thread: result,
        msgHistory: fetchUnreadMessages(result)
      });
    })

    .each(function(result) {
      const logger = threadLogger.child({threadId: result.thread.threadID});

      return Promise.all([
        logThreadActivity(logger, result),
        markRead(logger, result.thread.threadID),
        replyTo(logger, result.thread.threadID)
      ])

      .then(function() {
        logger.info('thread reply complete');
      });
    })

    // https://github.com/Schmavery/facebook-chat-api/issues/126
    // .finally(api.logoutAsync)

    .catch(appError);
})

.catch(appError);
