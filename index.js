import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: ACCESS_TOKEN })

const corsHeaders = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

addEventListener('fetch', event => {
  event.respondWith(handle(event.request))
})

// cors handling based on: https://developers.cloudflare.com/workers/examples/cors-header-proxy
async function handle(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request)
  } else if (request.method === 'POST') {
    return handleRequest(request)
  } else {
    return new Response(null, {
      status: 405,
      statusText: 'Method Not Allowed',
    })
  }
}

/**
 * Handles OPTIONS requests.
 * @param {Request} request
 */
function handleOptions(request) {
  const { headers } = request

  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS pre-flight request.
    return new Response(null, {
      headers: corsHeaders,
    })
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: 'POST, OPTIONS',
      },
    })
  }
}

/**
 * Makes POST request to GitHub API and returns the response.
 * @param {Request} request
 */
async function handleRequest(request) {
  if (request.headers.get('Content-Type') !== 'application/json') {
    return new Response(null, {
      status: 415,
      statusText: 'Unsupported Media Type',
      headers: corsHeaders,
    })
  }

  // Detect parse failures by setting `json` to null.
  const json = await request.json().catch(e => null)

  if (json === null) {
    return new Response('JSON parse failure', {
      status: 400,
      statusText: 'Bad Request',
      headers: corsHeaders,
    })
  }

  // verify reCAPTCHA token
  const { success, errors } = await verifyToken(json.recaptcha.token)

  // return error response if reCAPTCHA token is invalid
  if (!success) {
    return new Response(JSON.stringify({ errors }), {
      status: 400,
      statusText: 'Bad Request',
      headers: corsHeaders,
    })
  }

  // create issue
  const { course, user, review, reference, difficulty, overall } = json.details


  const title = `New review for ${course} by ${user}`
  let body = `> ${review}\n>\n`

  const parsedDifficulty = parseFloat(difficulty)
  if (!isNaN(parsedDifficulty)) {
    const clampedDifficulty = Math.min(Math.max(1, parsedDifficulty), 5)
    body += `> Difficulty: ${clampedDifficulty}/5\n`
  }

  const parsedOverall = parseFloat(overall)
  if (!isNaN(parsedOverall)) {
    const clampedOverall = Math.min(Math.max(1, parsedOverall), 5)
    body += `> Overall: ${clampedOverall}/5\n`
  }

  body += `> <cite><a href="${reference}">${user}</a>, ${new Date().toDateString().split(" ").slice(1).join(" ")}</cite>`

  const response = await octokit.rest.issues.create({
    owner: OWNER,
    repo: REPO,
    title: title,
    body: body,
    labels: LABELS.split(','),
  })

  return new Response(JSON.stringify({ url: response.data.html_url }), {
    headers: {
      status: 201,
      statusText: 'Created',
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}

/**
 * Verifies the reCAPTCHA token with Google.
 * @param {string} token
 */
async function verifyToken(token) {
  try {
    // add URL params
    const url = new URL('https://www.google.com/recaptcha/api/siteverify')
    url.searchParams.append('secret', RECAPTCHA_SECRET_KEY)
    url.searchParams.append('response', token)

    // return verification result
    const response = await fetch(url, {
      method: 'POST',
    })
    const json = await response.json()
    return { success: json.success, errors: json['error-codes'] }
  } catch (e) {
    return { success: false, errors: ['JSON parse failure'] }
  }
}
