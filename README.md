# png-from-sticker-bot

Very simple bot that, when sent a sticker, converts it to a `.png` image.  
[Use it at **@png_from_sticker_bot**!](http://t.me/png_from_sticker_bot)

Has support for caching, so that when sent a sticker that has already been
converted, it re-sends the converted image directly from Telegram.

This is part of the [Botgram](https://botgram.js.org) project.

## Installing

First make sure the `dwebp` command is available:

~~~ bash
sudo apt install webp
dwebp -version
~~~

Then, clone this repo and install dependencies as usual:

~~~ bash
git clone https://github.com/botgram/png-from-sticker-bot.git
npm install
~~~

Create the config file:

~~~ bash
cp config.js.example config.js
edit config.js  # Set bot token
~~~

Then, `npm start` or run the `server.js` script to start the bot.
We recommend using PM2.

*Make sure to delete `cache.db` if you run this with another Telegram bot!*
