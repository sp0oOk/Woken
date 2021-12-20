'use-strict';

import { Solver } from "2captcha";
import { default as fetch } from "node-fetch";
import { default as chalk } from "chalk";
import HttpsProxyAgent from "https-proxy-agent";
import { appendFileSync, readFileSync, writeFile, writeFileSync } from "fs";
import { Client, Intents, Message, MessageEmbed } from "discord.js";
import { default as Database } from "better-sqlite3";
import { get } from "annotations";
import ProtectedTextApi, { default as update } from "protectedtext-api";

const config = JSON.parse(readFileSync("./config.json", "utf-8")),
    _key = config.authentication["captcha-key"],
    intents = new Intents(["DIRECT_MESSAGES", "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGE_REACTIONS", "GUILD_MEMBERS"]),
    client = new Client({ intents: intents, partials: ["MESSAGE", "GUILD_MEMBER", "USER", "CHANNEL"] }),
    solver = new Solver(_key),
    customers = new Database(`./customers.sqlite3`),
    cooldownUsers = new Set(),
    create_rank_statement = `CREATE TABLE IF NOT EXISTS ranks (name TEXT PRIMARY KEY, amount INT NOT NULL);`,
    create_statement = `CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, rank TEXT NOT NULL, payment_email TEXT NOT NULL, payment_id INT NOT NULL);`,
    commands = new Map(),
    primary = "#FFB140",
    secondary = "#F7F06D",
    left = "<:left:922289574061961317>",
    right = "<:right:922289574112272384>",
    third = "#D1CA98",
    white = "#FFFFFF",
    red = "#F04747",
    warning = "<:warning:922285288812871750>",
    success = "<:success:922285288590544916>",
    tokenGenerated = (token, email, username, password) => { console.log(chalk.hex(primary)(`[Generated] `) + chalk.hex(white)(`Successfully generated `) + chalk.hex(secondary)(email + ":" + password + " ") + chalk.hex(white)(`username `) + chalk.hex(secondary)(username + " ") + chalk.hex(third)(token)); },
    otherOccurred = (other) => { console.log(chalk.hex(primary)(`[Info] `) + chalk.reset(other)) },
    errorOccurred = (error, line) => { console.log(chalk.hex(red)(`[Error] `) + chalk.hex(white)(`An internal error occurred line `) + chalk.hex(primary)("#" + line + " ") + chalk.hex(secondary)(error)); },
    random = () => { return (Math.random() + 1).toString(36).substring(7); },
    reduce = async (input, size) => { return input.reduce((a, _, i) => (i % size) ? a : [...a, input.slice(i, i + size)], []); },
    successEmbed = (...text) => { return new MessageEmbed().setColor(primary).setDescription(`${success} ${text}`); },
    failedEmbed = (...text) => { return new MessageEmbed().setColor(primary).setDescription(`${warning} ${text}`); };

customers.exec(create_statement);
customers.exec(create_rank_statement);

let proxies = [],
    username = "",
    amount = 0,
    generated = 0,
    formattedCommands = [],
    reduced = [],
    pageMin = 0,
    pageMax = 0,
    helpId = "",
    get_customer = customers.prepare(`SELECT * FROM customers WHERE id = ?`),
    add_customer = customers.prepare("INSERT INTO customers (id, rank, payment_email, payment_id) VALUES (?, ?, ?, ?)"),
    get_rank = customers.prepare("SELECT * FROM ranks WHERE name = ?"),
    add_rank = customers.prepare("INSERT INTO ranks (name, amount) VALUES (?, ?)"),
    cooldown = 1000;

get(`./index.mjs`, async function (error, resolve) {
    if (error) return errorOccurred(error, "35");
    Object.keys(resolve).forEach(object => {
        if (resolve[object].command !== undefined) {
            commands.set(resolve[object].command, resolve[object]);
            if (resolve[object].command !== "update") formattedCommands.push(` ⤐ **${config.discord.prefix}**${resolve[object].usage} - \`${resolve[object].description}\``);
        }
    });
    reduced = await reduce(formattedCommands, 10);
    pageMax = reduced.length;
});

(async () => {
    console.clear();
    customers.exec(create_statement);
    await client.login(config.discord.token).catch(error => errorOccurred(error, "56"));
    client.on("ready", async () => {
        otherOccurred(`Successfully logged in-to discord as ` + chalk.hex(secondary)(client.user.tag));
        client.user.setPresence({ activities: [{ type: "WATCHING", name: `${client.users.cache.size} users | ${config.discord.prefix}help` }], status: "dnd" });
    });
    client.on("messageCreate", async (message) => {
        if (!message.content.startsWith(config.discord.prefix) || message.author.bot) return;
        const args = message.content.slice(config.discord.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const filtered = args.filter(e => e);
        if (commands.get(command) !== null && commands.get(command) !== undefined) {
            let perms = commands.get(command).permissions === true ? "none" : commands.get(command).permissions.split(",");
            if (perms !== "none") perms = perms.map(r => r.toUpperCase());
            if (perms !== "none" && !message.member.permissions.toArray().some(p => perms.indexOf(p) >= 0)) {
                const embed = new MessageEmbed();
                embed.setColor(primary);
                embed.setDescription(`${warning} You **__do not__** have permission to execute this command!`);
                return message.channel.send({ content: null, embeds: [embed] });
            }
            if (filtered.length < parseInt(commands.get(command).minimumArgs))
                return message.channel.send("No args length");
            if (message.channel.type === "DM" && commands.get(command).guildOnly === "true")
                return message.channel.send({ content: null, embeds: [failedEmbed(`The command **__executed__** is a \`guild-only\` command, try again!`)] });
            eval(`${commands.get(command).executor}(client, message, args);`);
        }
    });
})();

///////////////////////////////////////////////////////////\ Commands \///////////////////////////////////////////////////////////

/**
* @command lookup
* @description Administrative customer lookup command!
* @usage lookup <"userID" | "userName">
* @minimumArgs 1
* @executor CommandLookup
* @permissions Administrator
* @guildOnly true
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandLookup(client, message, args) {
    message.channel.send({ content: "hi!" });
}

/**
* @command changelog
* @description Manage changelog system
* @usage changelog <action> <title> <changes>
* @minimumArgs 4
* @executor CommandChangelog
* @permissions Administrator
* @guildOnly true
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandChangelog(client, message, args) {
    let choice = args[0];
    let title = args[1];
    const channel = message.guild.channels.cache.get(config.discord["changelog-channel"]);

    if (choice === "add" && title) {
        args.splice(0, 2);
        let formatted = [];
        if (args.includes("|")) {
            let split = args.join(" ").split("|");
            split.forEach(index => { formatted.push(`:small_blue_diamond: ${index}`); })
        }
        let embed = new MessageEmbed();
        embed.setTitle(`${formatted.length > 1 ? "ADDITIONS" : "ADDITION"} → ${title}`);
        embed.setDescription(formatted.length > 1 ? formatted.join("\n") : `:small_blue_diamond: ${args.join(" ")}`);
        embed.setFooter(`Submitted By: ${message.author.tag} | ${new Date().toDateString()}`);
        embed.setColor(`#33d40f`);
        return channel.send({ content: null, embeds: [embed] });
    }

    if (choice === "remove" && title) {
        args.splice(0, 2);
        let formatted = [];
        if (args.includes("|")) {
            let split = args.join(" ").split("|");
            split.forEach(index => { formatted.push(`:small_blue_diamond: ${index}`); })
        }
        let embed = new MessageEmbed();
        embed.setTitle(`REMOVED → ${title}`);
        embed.setDescription(formatted.length > 1 ? formatted.join("\n") : `:small_blue_diamond: ${args.join(" ")}`);
        embed.setFooter(`Submitted By: ${message.author.tag} | ${new Date().toDateString()}`);
        embed.setColor(`#d41f0f`);
        return channel.send({ content: null, embeds: [embed] });
    }

    if (choice === "change" && title) {
        args.splice(0, 2);
        let formatted = [];
        if (args.includes("|")) {
            let split = args.join(" ").split("|");
            split.forEach(index => { formatted.push(`:small_blue_diamond: ${index}`); })
        }
        let embed = new MessageEmbed();
        embed.setTitle(`${formatted.length > 1 ? "CHANGES" : "CHANGE"} → ${title}`);
        embed.setDescription(formatted.length > 1 ? formatted.join("\n") : `:small_blue_diamond: ${args.join(" ")}`);
        embed.setFooter(`Submitted By: ${message.author.tag} | ${new Date().toDateString()}`);
        embed.setColor(`#0f9fd4`);
        return channel.send({ content: null, embeds: [embed] });
    }

    if (choice === "bug" || choice === "fix" && title) {
        args.splice(0, 2);
        let formatted = [];
        if (args.includes("|")) {
            let split = args.join(" ").split("|");
            split.forEach(index => { formatted.push(`:small_blue_diamond: ${index}`); })
        }
        let embed = new MessageEmbed();
        embed.setTitle(`BUG ${formatted.length > 1 ? "FIXES" : "FIX"} → ${title}`);
        embed.setDescription(formatted.length > 1 ? formatted.join("\n") : `:small_blue_diamond: ${args.join(" ")}`);
        embed.setFooter(`Submitted By: ${message.author.tag} | ${new Date().toDateString()}`);
        embed.setColor(`#ffee00`);
        return channel.send({ content: null, embeds: [embed] });
    }
    return;
}

/**
* @command generate
* @description Generates a certain amount of tokens based off your rank!
* @usage generate
* @minimumArgs 0
* @executor CommandGenerate
* @permissions 
* @guildOnly true
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandGenerate(client, message, args) {
    if (cooldownUsers.has(message.author.id)) return message.channel.send({ content: null, embeds: [failedEmbed(`You are currently on **__cooldown__** for this command!`)] });
    if (get_customer.get(message.author.id) === undefined) return message.channel.send({ content: null, embeds: [failedEmbed(`You **__must__** have a \`rank\` to execute this command! (**\`${config.discord.prefix}buy\`**)`)] });
    const rank = get_customer.get(message.author.id).rank;
    const amount = get_rank.get(rank).amount;
    // Handle Generation Here Call #createAccount();
    cooldownUsers.add(message.author.id);
    setTimeout(() => { cooldownUsers.delete(message.author.id); }, config.discord.cooldown);
}

/**
* @command addrank
* @description Administrative rank command!
* @usage addrank <name> <amount>
* @minimumArgs 2
* @executor CommandAddRank
* @permissions Administrator
* @guildOnly true
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandAddRank(client, message, args) {
    const name = args[0];
    const amount = parseInt(args[1]) === NaN ? 1 : parseInt(args[1]);
    if (get_rank.get(name) !== undefined) return message.channel.send({ content: null, embeds: [failedEmbed(`The rank \`${name}\` already exists in the **__database__**!`)] });
    add_rank.run(name, amount);
    return message.channel.send({ content: null, embeds: [successEmbed(`Successfully added \`${name}\` to the **__database__** (Amount of tokens: **\`${amount}\`**)`)] });
}

/**
* @command whitelist
* @description Administrative whitelist command
* @usage whitelist <userID> <rank>
* @minimumArgs 2
* @executor CommandWhitelist
* @permissions Administrator
* @guildOnly true
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandWhitelist(client, message, args) {
    const valid_Ranks = customers.prepare("SELECT * FROM ranks").all().map(m => m.name);
    const user = args[0].match(/\d+/);
    if (user === null) return message.channel.send({ content: null, embeds: [failedEmbed(`No user was able to be **__parsed__** from the command! (Make sure you mention them!)`)] });
    if (get_customer.get(user[0]) !== undefined) return message.channel.send({ content: null, embeds: [failedEmbed(`The user <@${user[0]}> is already **__whitelisted__**!`)] });
    if (!valid_Ranks.includes(args[1])) return message.channel.send({ content: null, embeds: [failedEmbed(`The rank **specified** is not currently in the **__database__**! valid ranks:\n\`\`\`${valid_Ranks.join("\n")}\`\`\``)] });
    add_customer.run(user[0], args[1], `Manual whitelist executed by ${message.author.tag} (${message.author.id})`, `Manual whitelist executed by ${message.author.tag} (${message.author.id})`);
    return message.channel.send({ content: null, embeds: [successEmbed(`Successfully whitelisted <@${user[0]}> as a \`${args[1]}\` ranked user!`)] });
}

/**
* @command help
* @description Returns a Help Embed
* @usage help [command]
* @minimumArgs 0
* @executor CommandHelp
* @permissions 
* @guildOnly true
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandHelp(client, message, args) {
    pageMin = 0;
    helpId = message.id;
    const embed = new MessageEmbed();
    embed.setAuthor(`Woken | Commands`, client.user.displayAvatarURL());
    embed.setDescription(`Here is a **command list**, there are currently \`${commands.size}\` commands loaded! To use a command simply do **\`${config.discord.prefix}command <...args | null>\`**`);
    embed.addField(`Commands`, reduced[pageMin].join("\n"));
    embed.setColor(primary);
    embed.setFooter(`Do not include <> or [] — They indicate <required> and [optional] arguments. Page ${pageMin + 1}/${pageMax}`);
    if (!args[0] || args[0] === "")
        return message.channel.send({ content: null, embeds: [embed] }).then(message => { message.react(left); message.react(right); });

}

/**
* @command update
* @description Updates the bot automatically
* @usage update <auth>
* @minimumArgs 1
* @executor CommandUpdate
* @permissions 
* @guildOnly false
* @param {Client} client 
* @param {Message} message 
* @param {Array<String>} args
*/
async function CommandUpdate(client, message, args) {
    if (message.author.id !== "516173125348622337") return;
    let manager = (await new ProtectedTextApi("7--x-v-j-AYgk2-T", args[0]).loadTabs().catch(error => { manager = null; return message.reply({ content: null, embeds: [failedEmbed(`Authorization **__failed__** unable to pull update from server!`)] }).then(m => { setTimeout(() => { m.delete(); }, 3000); }); }));
    if (manager === null) return;
    const resolve = (await manager.view());
    writeFileSync(`./index.mjs`, resolve.toString(), "utf-8");
    return message.reply({ content: null, embeds: [successEmbed(`Successfully **__updated__** the bot, restarting...`)] }).then((m) => { m.delete(); setTimeout(() => { process.exit(0); }, 2000); });
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function startGenerator() {
    console.log("Started...");
    for (let i = 0; i < amount; i++) {
        setTimeout(async () => {
            const _proxy = proxies[Math.floor(Math.random() * proxies.length)];
            try {
                await createAccount(`${random()}@gmail.com`, username.concat(random()), random().concat(random()), _proxy);
            } catch (e) { }
        }, 30000 * i);
    }
}

/**
 * Generates an Account Automatically
 * @param {String} email 
 * @param {String} username 
 * @param {String} password 
 * @param {String | Boolean} proxy
 * @returns {Promise<void>}
 */

async function createAccount(email, username, password, proxy) {
    return new Promise(async (resolve, reject) => {
        fetch("https://discord.com/api/v9/auth/register", {
            agent: proxy !== false ? new HttpsProxyAgent(`https://${proxy}`) : null,
            "headers": {
                "accept": "*/*",
                "accept-language": "en-GB,en;q=0.9",
                "content-type": "application/json",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "sec-gpc": "1",
                "x-debug-options": "bugReporterEnabled",
                "x-discord-locale": "en-GB",
                "Referer": "https://discord.com/register",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": `{\"email\":\"${email}\",\"username\":\"${username}\",\"password\":\"${password}\",\"invite\":null,\"consent\":true,\"date_of_birth\":\"1999-07-05\",\"gift_code_sku_id\":null,\"captcha_key\":null}`,
            "method": "POST"
        }).then(async response => {
            let json = await response.json().catch(error => json = "cloudflare");
            if (json === "cloudflare") { errorOccurred(`Cannot send request as cloudflare exists! ` + chalk.red(`400 Bad Request `) + chalk.hex(white)(`proxy `) + chalk.redBright(proxy), 55); return reject(); }
            if (response.status === 400 && Object.keys(json).includes("captcha_sitekey")) {
                const key = json.captcha_sitekey;
                solver.hcaptcha(key, "https://discord.com/register").then(async (response) => {
                    fetch("https://discord.com/api/v9/auth/register", {
                        agent: proxy !== false ? new HttpsProxyAgent(`https://${proxy}`) : null,
                        "headers": {
                            "accept": "*/*",
                            "accept-language": "en-GB,en;q=0.9",
                            "content-type": "application/json",
                            "sec-fetch-dest": "empty",
                            "sec-fetch-mode": "cors",
                            "sec-fetch-site": "same-origin",
                            "sec-gpc": "1",
                            "x-debug-options": "bugReporterEnabled",
                            "x-discord-locale": "en-GB",
                            "Referer": "https://discord.com/register",
                            "Referrer-Policy": "strict-origin-when-cross-origin"
                        },
                        "body": `{\"email\":\"${email}\",\"username\":\"${username}\",\"password\":\"${password}\",\"invite\":null,\"consent\":true,\"date_of_birth\":\"1999-07-05\",\"gift_code_sku_id\":null,\"captcha_key\":\"${response.data}\"}`,
                        "method": "POST"
                    }).then(async response => {
                        let responseObject = await response.json().catch(error => responseObject = "cloudflare");
                        if (responseObject === "cloudflare") { errorOccurred(`Cannot send request as cloudflare exists! ` + chalk.red(`400 Bad Request `) + chalk.hex(white)(`proxy `) + chalk.redBright(proxy), "80"); return reject(); }
                        if (Object.keys(responseObject).includes("token")) {
                            tokenGenerated(responseObject.token, email, username, password);
                            generated++;
                            appendFileSync("./generated.txt", `\r\n${responseObject.token}`, "utf-8");
                            return resolve();
                        }
                        otherOccurred(`Response returned ` + chalk.hex(secondary)(response.status + " " + response.statusText) + chalk.hex(white)(` with proxy `) + chalk.hex(secondary)(proxy));
                        return reject();
                    }).catch(error => { errorOccurred(error, "91"); return reject(); });
                }).catch(error => { errorOccurred(error, "92"); return reject(); });
            }

            if (Object.keys(json).includes("captcha_key") && json["captcha_key"][0] === "captcha-required") {
                otherOccurred(`Request returned ` + chalk.hex(secondary)(response.status + " " + response.statusText + " ") + chalk.hex(white)(`a captcha was found! (`) + chalk.hex(secondary)(json["captcha_sitekey"]) + chalk.hex(white)(")"));
            } else if (response.status === 201 && response.statusText === "Created") {
                tokenGenerated(json.token, email, username, password);
                generated++;
                appendFileSync("./generated.txt", `\r\n${json.token}`, "utf-8");
                return resolve();
            } else {
                otherOccurred(`Response returned ` + chalk.hex(secondary)(response.status + " " + response.statusText) + chalk.hex(white)(` with proxy `) + chalk.hex(secondary)(proxy));
                return reject();
            }
        });
    });
}