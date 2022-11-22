import { Octokit } from '@octokit/rest'
import { Buffer } from 'buffer'

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
 * Makes POST request to GitHub API to create a PR and returns the url of the PR.
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

	// create yaml string for the course review and PR body
	const { course, user, review, reference, difficulty, quality, sessionTaken } = json.details

	const title = `New review for ${course} by ${user}`
	let body = `> ${review}\n>\n`

	const parsedDifficulty = parseFloat(difficulty)
	let clampedDifficulty = 0
	if (!isNaN(parsedDifficulty)) {
		clampedDifficulty = Math.min(Math.max(1, parsedDifficulty), 5)
		body += `> Difficulty: ${clampedDifficulty}/5\n`
	}

	const parsedQuality = parseFloat(quality)
	let clampedQuality = 0
	if (!isNaN(parsedQuality)) {
		clampedQuality = Math.min(Math.max(1, parsedQuality), 5)
		body += `> Quality: ${clampedQuality}/5\n`
	}

	body += `> <cite><a href='${reference}'>${user}</a>, ${new Date()
		.toDateString()
		.split(' ')
		.slice(1)
		.join(' ')}, course taken during ${sessionTaken}</cite>`

	let yaml = `  - author: ${user}\n    authorLink: ${reference}\n    date: ${new Date().getUTCFullYear()}-${(
		new Date().getUTCMonth() + 1
	)
		.toString()
		.padStart(2, '0')}-${new Date()
		.getUTCDate()
		.toString()
		.padStart(2, '0')}\n    review: |\n      ${review.replaceAll('\n', '\n      ')}`

	if (clampedDifficulty) {
		yaml += `\n    difficulty: ${clampedDifficulty}`
	}
	if (clampedQuality) {
		yaml += `\n    quality: ${clampedQuality}`
	}

	yaml += `\n    sessionTaken: ${sessionTaken}\n`

	body += `\n<details><summary>View YAML for new review</summary>\n<pre>\n${yaml}\n<\pre>\n</details>`

	body = body + 'This is an auto-generated PR made using: https://github.com/ubccsss/course-review-worker\n'

	try {
		// new branch name for the PR
		const newBranchName = `new-review-${Date.now()}`

		// get ref for base branch
		const baseBranchRef = await octokit.git.getRef({
			owner: OWNER,
			repo: REPO,
			ref: `heads/${BASE_BRANCH}`,
		})

		// hash of last commit on base branch
		const lastCommitSha = baseBranchRef.data.object.sha

		// make a new branch from last commit on base branch
		await octokit.rest.git.createRef({
			owner: OWNER,
			repo: REPO,
			ref: `refs/heads/${newBranchName}`,
			sha: lastCommitSha,
		})

		let fileSha = {}
		try {
			// get the file contents for the course review file
			const existingReviews = await octokit.rest.repos.getContent({
				owner: OWNER,
				repo: REPO,
				path: `data/courseReviews/${course.toLowerCase().replace(' ', '-')}.yaml`,
				ref: `refs/heads/${newBranchName}`,
			})

			// if the file exists, we need to update it and to do that we need to get the sha of the file
			fileSha = { sha: existingReviews.data.sha }

			// if the file exists, we will append the new review to the existing reviews
			// otherwise, we will create a new file with the new review
			const existingReviewsContent = Buffer.from(existingReviews.data.content, 'base64')
				.toString()
				.replace('reviews:\n', '')
			yaml = 'reviews:\n' + yaml + existingReviewsContent
		} catch (e) {
			// if the file doesn't exist, we will create a new file with the new review
			yaml = 'reviews:\n' + yaml
		}

		// update or create the yaml file with the new review
		await octokit.rest.repos.createOrUpdateFileContents({
			owner: OWNER,
			repo: REPO,
			path: `data/courseReviews/${course.toLowerCase().replace(' ', '-')}.yaml`,
			branch: newBranchName,
			message: `Added new review for ${course}`,
			content: btoa(yaml),
			...fileSha,
		})

		// make a PR to merge the new branch into the base branch
		const newPR = await octokit.rest.pulls.create({
			owner: OWNER,
			repo: REPO,
			title: title,
			body: body,
			head: newBranchName,
			base: BASE_BRANCH,
		})

		// add label to PR
		await octokit.rest.issues.addLabels({
			owner: OWNER,
			repo: REPO,
			issue_number: newPR.data.number,
			labels: LABELS.split(','),
		})

		// request a review from the reviewers
		await octokit.rest.pulls.requestReviewers({
			owner: OWNER,
			repo: REPO,
			pull_number: newPR.data.number,
			reviewers: USERS.split(','),
			team_reviewers: TEAMS.split(','),
		})

		// return the url of the new PR
		return new Response(JSON.stringify({ url: newPR.data.html_url }), {
			headers: {
				status: 201,
				statusText: 'Created',
				'Content-Type': 'application/json',
				...corsHeaders,
			},
		})
	} catch (error) {
		console.error(error.message)
		return new Response(JSON.stringify(error), {
			status: 500,
			statusText: 'Internal Server Error',
			'Content-Type': 'application/json',
			...corsHeaders,
		})
	}
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
