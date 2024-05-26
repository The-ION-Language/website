import express from 'express';
import axios from 'axios';
import customFS from 'github-to-fs';
import bodyParser from 'body-parser';
import fs, { fstat } from 'fs';


const app = express();
app.use('/css', express.static('CSS'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const cfs = new customFS('https://api.github.com/repos/The-ION-Language/modules', process.env.GHTOKEN);

const PORT = process.env.PORT || 3000;

app.get('/newmodule', (_, res) => {
	res.send(fs.readFileSync('login.html').toString().replace('{{GITHUB_CLIENT_ID}}', process.env.GITHUB_CLIENT_ID));
});

app.get('/', (_, res) => res.sendFile('index.html', { root: '.' }));


async function validateCode(requestToken) {
	const tokenResponse = await axios.post(
		'https://github.com/login/oauth/access_token',
		{
			client_id: process.env.GITHUB_CLIENT_ID,
			client_secret: process.env.GITHUB_CLIENT_SECRET,
			code: requestToken,
		},
		{
			headers: {
				accept: 'application/json',
			},
		}
	);

	if (!tokenResponse.data.code && !tokenResponse.data.access_token) return tokenResponse.data;
	const token = tokenResponse.data.access_token || tokenResponse.data.code;

	const userResponse = await axios.get('https://api.github.com/user', {
		headers: {
			Authorization: `token ${token}`,
		},
	});

	const { login, email } = userResponse.data;
	return { login, email };
}


app.get('/callback', async (req, res) => {
	try {
		res.sendFile('fileUpload.html', { root: '.' });
	}
	catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});


app.post('/upload', async (req, res) => {
	try {
		const { code, repourl } = req.headers;
		if (!code) return res.sendStatus(404);

		const conf = (await axios.get(repourl)).data,
			confContent = JSON.parse(atob(conf.content).toString());

		const { packageName, login: lOG, repourl: repourlOG } = confContent;
		if (!packageName || !lOG | !repourlOG) return res.sendStatus(403);

		// make sure the user is authorized
		const authR = await validateCode(code),
			{ login, email } = authR;
		if (!login) return res.status(401).send(authR);

		// check for package in the repo
		let confMain = await axios.get(`https://api.github.com/repos/The-ION-Language/modules/contents/modules/${packageName}.json`, {
			headers: {
				'Authorization': `token ${process.env.GHTOKEN}`
			}
		}).then(d => JSON.parse(atob(d.data.content).toString())).catch(_ => null);

		if (confMain) {
			if (repourl !== confMain.repourl || login !== confMain.login) return res.sendStatus(403);
			confMain['version'] = (confMain['version']) ? Number(confMain['version']) + 1 : 1;
		}
		else confMain = confContent;

		await cfs.writeFileSync(`modules/${packageName}.json`, JSON.stringify(confMain), null, `${login}${(email) ? ' (' + email + ')' : ''} updated ${packageName}`);
		res.contentType("text").status(200).send(`https://github.com/The-ION-Language/modules/blob/main/modules/${packageName}.json`);
	}
	catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});


app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));
