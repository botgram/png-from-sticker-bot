const util = require("util")
const tmp = require("tmp-promise")
const fs = require("fs")
const { execFileSync } = require("child_process")
const botgram = require("botgram")

const execFile = util.promisify(require("child_process").execFile)
const fileStream = util.promisify(bot.fileStream.bind(bot))
const pipe = (src, dest, options) => new Promise((resolve, reject) => {
    src.on("error", reject)
    dest.on("error", reject)
    src.pipe(dest, options).on("finish", () => resolve())
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

const bot = botgram(config.api_token)

bot.sticker((msg, reply) => {
    // send "uploading photo to the user"
    reply.action("upload_photo")

    convertSticker(msg.file, reply).catch((err) => {
        reply.text("Oops! I couldn't convert that sticker 😔")
        console.error("Error when converting sticker %s:\n%s", msg.file.id, err.stack)
    });
})

bot.command("start", "help", "usage", (msg, reply) => {
    reply.text("Hi! Send me stickers and I'll convert them to 🖼 .png images, keeping the transparency.")
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
        { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 }).catch((err) => {
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
