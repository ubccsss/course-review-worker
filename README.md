# 👷 GitHub issues worker

A Cloudflare worker for creating GitHub issues for new course reviews for [ubccsss.org's](https://github.com/ubccsss/ubccsss.org) courses database. Reviews are verified using reCAPTCHA.

## Getting Started

```bash
$ git clone
$ cd github-issues-worker
$ npm install
$ npm i @cloudflare/wrangler -g
$ wrangler login  # select y to login via browser
```

## Environments

- Development: default
- Production: `--env production`

## Environment Variables

Below are the environment variables that are used by the worker. Each one of them has a value for production and development. They can be set in [`wrangler.toml`](wrangler.toml).

- `OWNER` - owner of the GitHub repository
- `REPO` - name of the GitHub repository
- `LABELS` - comma-separated list of labels to apply to new issues
- `ORIGIN` - acceptable origin for requests to the worker

## Secrets

- `ACCESS_TOKEN` - [GitHub access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- `RECAPTCHA_SECRET_KEY` - [Google reCAPTCHA secret key](https://developers.google.com/recaptcha/intro)

Secrets can be managed using [wrangler](https://developers.cloudflare.com/workers/cli-wrangler/commands#secret) or using the [Cloudflare dashboard](https://dash.cloudflare.com).

## Example call

```javascript
const issue = await fetch(WORKER_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    recaptcha: {
      token: token,
    },
    details: {
      course: course,
      user: user,
      review: review,
      reference: reference,
    },
  }),
})
```

Complete exmample call with error handling [here](https://github.com/ubccsss/ubccsss.org/blob/master/assets/js/create-github-issue.js).

## Contributing

[`index.js`](index.js) contains the Worker's script.

[`wrangler.toml`](wrangler.toml) contains the worker's configuration.

Running the worker locally:

```bash
$ wrangler dev  # runs dev environment
$ wrangler dev --env production  # runs production envirnment
```

Publishing the worker to Cloudflare:

```bash
$ wrangler publish  # publishes dev environment
$ wrangler publish --env production  # publishes production environment
```

Further documentation on Cloudflare workers can be found [here](https://developers.cloudflare.com/workers).

Further documentation on Wrangler can be found [here](https://developers.cloudflare.com/workers/cli-wrangler).
