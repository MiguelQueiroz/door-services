import fs from "fs";
import histogram from "bars";
import moment from "moment";
import _ from "underscore";

import DoorSocketServer from "./DoorSocketServer";
import DoorSlackBot from "./DoorSlackBot";
import startHttpApi from "./httpApi";
import StatsDatabase from "./StatsDatabase";

const config = JSON.parse(fs.readFileSync("config.json"));

const sockServer = new DoorSocketServer({ port: config.backend.port });
const bot = new DoorSlackBot(config.slack);

bot.onMessageLike(/garage/i, user => {
  if (!user) {
    bot.postMessage("Unrecognized user.");

  } if (!sockServer.available("garage")) {
    bot.postMessage("The remote garage opening service is not operational at the moment. " +
        "Consider dispatching a drone to pick up a human.");

  } else {
    sockServer.broadcast("garage", "2500");
    StatsDatabase.registerGarageOpen(user);
    bot.postMessage(`Opening the garage as requested by ${user.name} (${user.email})...`);
  }
});

bot.onMessageLike(/open/i, user => {
  if (!user) {
    bot.postMessage("Unrecognized user.");

  } if (!sockServer.available("door")) {
    bot.postMessage("The remote door opening service is not operational at the moment. " +
        "Consider dispatching a drone to pick up a human.");

  } else {
    sockServer.broadcast("door", "2500");
    StatsDatabase.registerDoorOpen(user);
    bot.postMessage(`Opening the door as requested by ${user.name} (${user.email})...`);
  }
});

bot.onMessageLike(/stats/i, () => {
  StatsDatabase.getStats().then(stats => {
    if (!stats) {
      throw new Error("There are no available stats for the remote door opening service");
    }

    const count = _.reduce(_.values(_.omit(stats, "since")), (m, val) => m + val, 0);
    const savedTime = Math.round(count * 40.0);
    const savedTimeStr = moment.duration(savedTime, "seconds").humanize();
    const timeStr = moment(stats.since, moment.ISO_8601).fromNow();
    const msg =
        `The remote door opening service was used ${count} time${count > 1 ? "s" : ""} since ${timeStr}.\n` +
        `Breakdown by day:\n\`\`\`${histogram(_.omit(stats, "since"), { sort: false })}\`\`\`\n` +
        `Assuming that it takes ~40 seconds to open the door and get back, around ${savedTimeStr} have been saved!`;
    bot.postMessage(msg);
  }).catch(err => {
    console.error(err);
    bot.postMessage(err.message);
  });
});

startHttpApi(config, bot, sockServer);
