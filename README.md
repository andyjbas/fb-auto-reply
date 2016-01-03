# Facebook Auto Chat Bot

Automatically reply to incoming facebook messages, thereby allowing you to avoid the horrors of facebook altogether.

## Setup

* Ensure you have [bunyan]() and [pm2]() installed and on your path.
* `npm install`
* `cp .env.example .env` and fill in all values.
* `npm start`
* Optionally, `cp app.json.example app.json`, configure, and then:
  * `pm2 deploy app.json production setup`
  * Move your production `.env` and `app.json` up to the server.
  * `pm2 deploy app.json production`
