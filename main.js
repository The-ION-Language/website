import express from 'express';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
import customFS from 'github-to-fs';
import fs, { fstat } from 'fs';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const cfs = new customFS('https://api.github.com/repos/The-ION-Language/modules', process.env.GHTOKEN);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
	res.send(fs.readFileSync('login.html').toString().replace('{{GITHUB_CLIENT_ID}}', process.env.GITHUB_CLIENT_ID));
});


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

	if (!tokenResponse.data.code && !tokenResponse.data.access_token) return false;
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


app.post('/upload', upload.single('file'), async (req, res) => {
	try {
		if (req.file?.mimetype !== 'application/x-compressed-tar') return res.sendStatus(415);

		const { code } = req.headers;
		if (!code) return res.sendStatus(401);

		// make sure the user is authorized
		const { login, email } = await validateCode(code);
		if (!login) return res.sendStatus(401);

		// if (req.file.mimetype !== '')

		await cfs.writeFileSync(req.file.originalname, req.file.buffer, null, `updated ${req.file.originalname.replace('.tgz', '')} ${login}${(email) ? ' (' + email + ')' : ''}`);
		res.contentType("text").send(`uploaded module to https://github.com/The-ION-Language/modules/blob/main/${req.file.originalname}`);
	}
	catch (err) {
		console.error(err);
		res.sendStatus(500);
	}
});


app.listen(PORT, () => {
	console.log(`Server is running at http://localhost:${PORT}`);
});
