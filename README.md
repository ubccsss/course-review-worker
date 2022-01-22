# 👷 GitHub issues worker

A Cloudflare worker for creating GitHub issues for new course reviews for [ubccsss.org's](https://github.com/ubccsss/ubccsss.org) courses database.

## Getting Started

```bash
$ git clone
$ cd github-issues-worker
$ npm install
$ npm i @cloudflare/wrangler -g
$ wrangler login  # select y to login via browser
```

## Contributing

[`index.js`](index.js) contains the Worker's script.

[`wrangler.toml`](wrangler.toml) contains the worker's configuration.

Running the worker locally:

```bash
$ wranger dev  # runs dev environment
$ wrangler dev --env production  # runs production envirnment
```

Publishing the worker to Cloudflare:

```bash
$ wrangler publish  # publishes dev environment
$ wrangler publish --env production  # publishes production environment
```
Further documentation on Cloudflare workers can be found [here](https://developers.cloudflare.com/workers).

Further documentation on Wrangler can be found [here](https://developers.cloudflare.com/workers/cli-wrangler).
