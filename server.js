const util = require("util")
const tmp = require("tmp-promise")
const fs = require("fs")
const { execFileSync } = require("child_process")
const https = require("https")
const botgram = require("botgram")
const level = require("level")
const crypto = require("crypto")

const execFile = util.promisify(require("child_process").execFile)
const pipe = (src, dest) => new Promise((resolve, reject) => {
    src.on("error", reject)
    dest.on("error", reject)
    src.pipe(dest).on("finish", () => resolve())
})

try {
    config = require("./config.js")
} catch (err) {
    console.error("No valid config file found!", err)
    process.exit(1)
}

try {
    // Test command by getting version
    const version = execFileSync(config.dwebp, ["-version"]).toString()
    console.log("Using dwebp version: %s", version.trim())
} catch (err) {
    console.error("dwebp command not available!", err)
    process.exit(1)
}

const cache = level(config.cache_db)

const bot = botgram(config.api_token, {
    agent: new https.Agent({ keepAlive: true, maxFreeSockets: config.maxFreeSockets }),
})

bot.context()

bot.message(apologizeIfQueued)

bot.sticker(async (msg, reply) => {
    const id = generateId(msg)

    try {
        // try to send from cache
        let pngId = await cache.get(id).catch(() => {})
        if (pngId)
            return await reply.document(pngId).then()

        // send "uploading photo to the user"
        reply.action("upload_document")

        // if there's an ongoing conversion, wait for it. otherwise, start one
        if (Object.hasOwnProperty.call(ongoingConversions, id)) {
            pngId = await ongoingConversions[id]
            return await reply.document(pngId).then()
        }

        // start own conversion
        const promise = convertSticker(id, msg, reply)
        registerConversion(id, promise)
        return await promise
    } catch (err) {
        reply.text(`
Oops! I couldn't convert that sticker 😔
Something unexpected happened, we'll look into it.
        `)
        console.error("Error when converting sticker %s:\n%s", msg.file.id, err.stack)
    }
})

bot.command("start", "help", "usage", (msg, reply) => {
    reply.markdown(`
🖼 Send me stickers and I'll convert them to transparent .png images!

💡 The image will be sent as a _file attachment_! If you're on Android, tap on the attachment and choose _Save to downloads_.

📁 If you send me the same sticker twice, I'll just return a reference to the previous file. No need to download it again and no extra space used.
    `)
})

bot.message((msg, reply, next) => {
    if (msg.type !== "sticker" && msg.type !== "text")
        reply.text("That was not a sticker... 🤔")
})

// Base function to convert a sticker and upload the result to the user
// Returns: Promise for the sent Message

async function convertSticker(id, msg, reply) {
    // start sticker download
    const streamPromise = fileStream(msg.file)

    // create temporal file
    const tmpFilePromise = tmp.file({ postfix: ".webp" })

    // wait until both are ready, and copy data from one into another
    const [ stream, tmpFile ] = await Promise.all([ streamPromise, tmpFilePromise ])
    const tmpStream = fs.createWriteStream(null, { fd: tmpFile.fd })
    await pipe(stream, tmpStream)

    // convert webp to png
    const convertPromise = execFile(config.dwebp, [tmpFile.path, "-o", "-"],
        { encoding: "buffer", maxBuffer: config.maxBuffer }).catch((err) => {
        throw Error("Conversion failed, code %s, signal %s, stderr %s",
            err.code, err.signal, util.inspect(err.stderr))
    })
    const { stdout } = await convertPromise
    tmpFile.cleanup()

    // send as document
    stdout.options = generateFileName(id, msg)
    reply.document(stdout)
    return await reply.then()
}

const generateId = (msg) =>
    crypto.createHash("md5").update((msg.setName || "") + "\n" + msg.file.id).digest("hex")

const generateFileName = (id, { setName }) => {
    const bid = Buffer(id, "hex").toString("base64").replace("/", "_")
    const name = setName ? (setName.replace(/[^a-zA-Z0-9_]+/g, "_") + "_" + bid.substring(0, 4)) : bid.substring(0, 7)
    return name + ".png"
}

const fileStream = util.promisify(bot.fileStream.bind(bot))

// Queue of ongoing conversions

const ongoingConversions = {}

function registerConversion(id, promise) {
    ongoingConversions[id] = promise
        .then((msg) => {
            cache.put(id, msg.file.id, () => {})
            return msg.file.id
        }).then((result) => {
            delete ongoingConversions[id]
            return result
        }, (error) => {
            delete ongoingConversions[id]
            throw error
        })
    // Add a rejection handler so Node does not complain
    ongoingConversions[id].catch(() => {})
}

// Listen to error events

bot.on("error", (err) => {
    console.error("\nInternal error!\n%s\n", err.stack)
})

// Print message when bot is ready

bot.on("ready", (err) => {
    console.log("Bot is ready.")
})

// Middleware to apologize if there are queued messages

function apologizeIfQueued(msg, reply, next) {
    if (!msg.queued) return next()
    const { context, chat } = msg

    // If it's the first time we see this chat, decide if apology is needed
    if (context.apologize === undefined) {
        const downtime = Date.now() - msg.date.getTime()
        context.apologize = (downtime > 60 * 1000)
        if (context.apologize) {
            reply.text("🤖 Sorry! I was having problems, but I'm back online now.")
            console.error("Apologizing to %s %s (%s) for %ss downtime",
                chat.type, chat.id, chat.name, Math.ceil(downtime/1000))
        }
    }

    // If apology was not deemed necessary, process messages
    if (!context.apologize) return next()
}

// Handle regular exit nicely

function handleExit(signal) {
    bot.stop()
    cache.close()
}

process.on('SIGINT', handleExit)
process.on('SIGTERM', handleExit)
