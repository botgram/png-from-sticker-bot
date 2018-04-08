const tmp = require("tmp")
const fs = require("fs")
const { execFile, execFileSync } = require("child_process")
const botgram = require("botgram")

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

    // start downloading sticker
    bot.fileStream(msg.file, (err, stream) => {
        if (err) {
            console.error("Error when downloading sticker!\n%s", err.stack)
            return reply.text("Oops! I couldn't download that sticker 😔")
        }

        stream.on("error", (err) => {
            console.error("Error when getting sticker data!\n%s", err.stack)
        })

        // create temporal file, write sticker to it
        tmp.file({ postfix: ".webp" }, (err, path, fd, cleanupCallback) => {
            stream.pipe(fs.createWriteStream(null, { fd }))
                .on("finish", () => stickerWritten(path, cleanupCallback))
        })
    })

    function stickerWritten(path, cleanupCallback) {
        // convert webp to png
        execFile(config.dwebp, [path, "-o", "-"],
            { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
            (err, stdout, stderr) => {
            if (err) {
                console.error("Conversion failed!", err, stderr.toString())
                return reply.text("Sorry, conversion failed")
            }
            stdout.options = "sticker.png";
            reply.document(stdout)
        })
    }
})

bot.command("start", "help", "usage", (msg, reply) => {
    reply.text("Hi! Send me stickers and I'll convert them to 🖼 .png images, keeping the transparency.")
})
