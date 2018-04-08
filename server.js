const util = require("util")
const tmp = require("tmp-promise")
const fs = require("fs")
const { execFileSync } = require("child_process")
const botgram = require("botgram")
const level = require("level")

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

const bot = botgram(config.api_token)

bot.sticker(async (msg, reply) => {
    const stickerFile = msg.file
    const id = stickerFile.id

    try {
        // try to send from cache
        let pngId = await cache.get(id).catch(() => {})
        if (pngId)
            return await reply.document(pngId).then()

        // send "uploading photo to the user"
        reply.action("upload_photo")

        // if there's an ongoing conversion, wait for it. otherwise, start one
        if (Object.hasOwnProperty.call(ongoingConversions, id)) {
            pngId = await ongoingConversions[id]
            return await reply.document(pngId).then()
        }

        // start own conversion
        const promise = convertSticker(stickerFile, reply)
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
    reply.text(`
Hi! Send me stickers and I'll convert them to 🖼 .png images, keeping the transparency.

📁 If you send me the same sticker twice, I'll just return a reference to the previous file. That way you won't have to download it again.
    `)
})

// Base function to convert a sticker and upload the result to the user
// Returns: Promise for the sent Message

async function convertSticker(stickerFile, reply) {
    // start sticker download
    const streamPromise = fileStream(stickerFile)

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
    stdout.options = "sticker.png"
    reply.document(stdout)
    return await reply.then()
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
}
