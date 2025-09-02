const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('file');
const fileInfo = document.getElementById('fileInfo');
const summaryEl = document.getElementById('summary');
const resultBox = document.getElementById('result');
const downloadBtn = document.getElementById('downloadBtn');
const dropZone = document.getElementById('dropZone');
const previewToggle = document.getElementById('preview_toggle');
const previewCountInput = document.getElementById('preview_count');
const previewBox = document.getElementById('preview_box');
const cleanBtn = document.getElementById('cleanBtn');
const saveKeywordsBtn = document.getElementById('saveKeywords');
const loadKeywordsBtn = document.getElementById('loadKeywords');
const savedKeywordsDiv = document.getElementById('savedKeywords');

let cleanedEmails = [];
let lastSummary = null;
let uploadedExt = 'csv';

// Email extraction regex (liberal)
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Keyword storage
const KEYWORDS_STORAGE_KEY = 'emailFilterKeywords';

// Load saved keywords on page load
document.addEventListener('DOMContentLoaded', () => {
	loadSavedKeywords();
});

fileInput.addEventListener('change', () => {
	const file = fileInput.files[0];
	if (!file) {
		fileInfo.textContent = '';
		return;
	}
	const sizeKB = (file.size / 1024).toFixed(1);
	uploadedExt = (file.name.split('.').pop() || 'csv').toLowerCase();
	fileInfo.textContent = `${file.name} — ${sizeKB} KB`;
});

// Keyword management functions
function saveKeywords() {
	const keywords = document.getElementById('keywords').value.trim();
	if (!keywords) {
		alert('Please enter keywords to save');
		return;
	}
	
	try {
		const existing = JSON.parse(localStorage.getItem(KEYWORDS_STORAGE_KEY) || '[]');
		if (!existing.includes(keywords)) {
			existing.push(keywords);
			localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(existing));
			loadSavedKeywords();
			alert('Keywords saved!');
		} else {
			alert('These keywords are already saved');
		}
	} catch (e) {
		alert('Failed to save keywords');
	}
}

function loadSavedKeywords() {
	try {
		const saved = JSON.parse(localStorage.getItem(KEYWORDS_STORAGE_KEY) || '[]');
		if (saved.length === 0) {
			savedKeywordsDiv.innerHTML = '<em>No saved keywords</em>';
			return;
		}
		
		savedKeywordsDiv.innerHTML = saved.map((kw, i) => 
			`<span class="saved-keyword">${kw} <button type="button" onclick="loadKeyword(${i})" class="btn-link">Load</button> <button type="button" onclick="deleteKeyword(${i})" class="btn-link delete">Delete</button></span>`
		).join('<br>');
	} catch (e) {
		savedKeywordsDiv.innerHTML = '<em>Error loading keywords</em>';
	}
}

function loadKeyword(index) {
	try {
		const saved = JSON.parse(localStorage.getItem(KEYWORDS_STORAGE_KEY) || '[]');
		if (saved[index]) {
			document.getElementById('keywords').value = saved[index];
		}
	} catch (e) {
		alert('Failed to load keyword');
	}
}

function deleteKeyword(index) {
	try {
		const saved = JSON.parse(localStorage.getItem(KEYWORDS_STORAGE_KEY) || '[]');
		saved.splice(index, 1);
		localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(saved));
		loadSavedKeywords();
	} catch (e) {
		alert('Failed to delete keyword');
	}
}

// Wire up keyword management
saveKeywordsBtn.addEventListener('click', saveKeywords);
loadKeywordsBtn.addEventListener('click', () => {
	try {
		const saved = JSON.parse(localStorage.getItem(KEYWORDS_STORAGE_KEY) || '[]');
		if (saved.length === 0) {
			alert('No saved keywords found');
			return;
		}
		document.getElementById('keywords').value = saved[saved.length - 1];
	} catch (e) {
		alert('Failed to load keywords');
	}
});

// Drag & Drop handlers
function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(evt => {
	window.addEventListener(evt, preventDefaults, false);
});
['dragenter','dragover'].forEach(evt => {
	dropZone.addEventListener(evt, (e) => { preventDefaults(e); dropZone.classList.add('dragover'); });
});
['dragleave','drop'].forEach(evt => {
	dropZone.addEventListener(evt, (e) => { preventDefaults(e); dropZone.classList.remove('dragover'); });
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });

dropZone.addEventListener('drop', (e) => {
	const dt = e.dataTransfer;
	const files = dt && dt.files ? dt.files : null;
	if (!files || !files.length) return;
	const file = files[0];
	const name = (file.name || '').toLowerCase();
	if (!(/\.(txt|csv|xlsx)$/i).test(name)) {
		alert('Unsupported file type. Use .txt, .csv, or .xlsx');
		return;
	}
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(file);
	fileInput.files = dataTransfer.files;
	fileInput.dispatchEvent(new Event('change'));
});

function readFileAsArrayBuffer(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsArrayBuffer(file);
	});
}

function readFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result || '');
		reader.onerror = reject;
		reader.readAsText(file);
	});
}

function normalizeText(text) {
	// Remove BOM, normalize line endings
	return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function extractEmailsFromText(text) {
	const normalized = normalizeText(text);
	const matches = normalized.match(EMAIL_RE) || [];
	return matches.map(s => s.trim());
}

function parseFileToEmails(file) {
	return new Promise(async (resolve, reject) => {
		const name = file.name.toLowerCase();
		try {
			if (name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.log')) {
				const text = await readFileAsText(file);
				resolve(extractEmailsFromText(text));
			} else if (name.endsWith('.xlsx')) {
				const buf = await readFileAsArrayBuffer(file);
				const wb = XLSX.read(buf, { type: 'array' });
				const emails = [];
				for (const sheetName of wb.SheetNames) {
					const ws = wb.Sheets[sheetName];
					const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
					for (const row of arr) {
						if (!row) continue;
						for (const cell of row) {
							if (cell === undefined || cell === null) continue;
							const str = String(cell);
							const found = extractEmailsFromText(str);
							for (const f of found) emails.push(f);
						}
					}
				}
				resolve(emails.filter(Boolean));
			} else {
				reject(new Error('Unsupported file type. Use .txt, .csv, or .xlsx'));
			}
		} catch (e) {
			reject(e);
		}
	});
}

function isValidEmail(email) {
	const simple = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
	if (!simple.test(email)) return false;
	return true;
}

function isSingleCharacterEmail(email) {
	const [localPart] = email.split('@');
	return localPart.length === 1;
}

function isNumericStartEmail(email) {
	const [localPart] = email.split('@');
	return /^\d/.test(localPart);
}

function containsKeywords(email, keywords) {
	if (!keywords || keywords.length === 0) return false;
	const e = email.toLowerCase();
	for (const k of keywords) {
		if (!k) continue;
		if (e.includes(k.toLowerCase())) return true;
	}
	return false;
}

function cleanEmails(rawEmails, opts) {
	let arr = rawEmails.map(String).map(s => s.trim()).filter(Boolean);
	let removedInvalid = 0;
	let removedKeywords = 0;
	let removedDuplicates = 0;
	let removedSingleChar = 0;
	let removedNumericStart = 0;

	if (opts.remove_invalid) {
		const before = arr.length;
		arr = arr.filter(isValidEmail);
		removedInvalid = before - arr.length;
	}

	if (opts.remove_single_char) {
		const before = arr.length;
		arr = arr.filter(e => !isSingleCharacterEmail(e));
		removedSingleChar = before - arr.length;
	}

	if (opts.remove_numeric_start) {
		const before = arr.length;
		arr = arr.filter(e => !isNumericStartEmail(e));
		removedNumericStart = before - arr.length;
	}

	if (opts.keywords && opts.keywords.length) {
		const before = arr.length;
		arr = arr.filter(e => !containsKeywords(e, opts.keywords));
		removedKeywords = before - arr.length;
	}

	if (opts.remove_duplicates) {
		const before = arr.length;
		const seen = new Set();
		const out = [];
		for (const e of arr) {
			const n = e.toLowerCase();
			if (seen.has(n)) continue;
			seen.add(n);
			out.push(e);
		}
		removedDuplicates = before - out.length;
		arr = out;
	}

	return {
		list: arr,
		summary: {
			original: rawEmails.length,
			kept: arr.length,
			removed_invalid: removedInvalid,
			removed_single_char: removedSingleChar,
			removed_numeric_start: removedNumericStart,
			removed_duplicates: removedDuplicates,
			removed_keywords: removedKeywords,
		},
	};
}

function toCSV(emails) { return emails.join('\n'); }
function toTXT(emails) { return emails.join('\n'); }

function toXLSXBlob(emails) {
	const ws = XLSX.utils.aoa_to_sheet(emails.map(e => [e]));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Cleaned');
	const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
	return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function triggerDownload(filename, blobOrText, mime) {
	let blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function renderPreview() {
	if (!previewToggle.checked) {
		previewBox.classList.add('hidden');
		return;
	}
	previewBox.classList.remove('hidden');
	const maxRows = Math.max(1, Math.min(10000, Number(previewCountInput.value) || 100));
	const lines = cleanedEmails.slice(0, maxRows).join('\n');
	const extra = cleanedEmails.length > maxRows ? `\n… (${cleanedEmails.length - maxRows} more)` : '';
	previewBox.textContent = lines + extra;
}

previewToggle.addEventListener('change', renderPreview);
previewCountInput.addEventListener('input', renderPreview);

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const file = fileInput.files[0];
	if (!file) return alert('Please choose a file');

	const opts = {
		remove_duplicates: document.getElementById('remove_duplicates').checked,
		remove_invalid: document.getElementById('remove_invalid').checked,
		remove_single_char: document.getElementById('remove_single_char').checked,
		remove_numeric_start: document.getElementById('remove_numeric_start').checked,
		keywords: (document.getElementById('keywords').value || '').split(',').map(x => x.trim()).filter(Boolean),
		output_format: document.getElementById('output_format').value,
	};

	resultBox.classList.remove('hidden');
	summaryEl.textContent = 'Processing...';
	downloadBtn.disabled = true;
	const originalBtnText = cleanBtn.textContent;
	cleanBtn.textContent = 'Cleaning...';
	cleanBtn.disabled = true;

	try {
		const rawEmails = await parseFileToEmails(file);
		const rawCount = rawEmails.length;
		const { list, summary } = cleanEmails(rawEmails, opts);
		cleanedEmails = list;
		lastSummary = summary;

		summaryEl.innerHTML = `
			<div><strong>Found (raw)</strong>: ${rawCount}</div>
			<div><strong>Original</strong>: ${summary.original}</div>
			<div><strong>Kept</strong>: ${summary.kept}</div>
			<div><strong>Removed invalid</strong>: ${summary.removed_invalid}</div>
			<div><strong>Removed single char</strong>: ${summary.removed_single_char}</div>
			<div><strong>Removed numeric start</strong>: ${summary.removed_numeric_start}</div>
			<div><strong>Removed duplicates</strong>: ${summary.removed_duplicates}</div>
			<div><strong>Removed by keywords</strong>: ${summary.removed_keywords}</div>
		`;

		renderPreview();

		if (cleanedEmails.length === 0) {
			downloadBtn.disabled = true;
			previewBox.textContent = 'No valid emails found after filtering.';
			previewBox.classList.remove('hidden');
		} else {
			downloadBtn.disabled = false;
		}

		downloadBtn.onclick = () => {
			let fmt = opts.output_format === 'same' ? (uploadedExt || 'csv') : opts.output_format;
			fmt = ['csv','txt','xlsx'].includes(fmt) ? fmt : 'csv';
			const base = (file.name.replace(/\.[^.]+$/, '') || 'cleaned');
			if (fmt === 'csv') {
				triggerDownload(`${base}.csv`, toCSV(cleanedEmails), 'text/csv');
			} else if (fmt === 'txt') {
				triggerDownload(`${base}.txt`, toTXT(cleanedEmails), 'text/plain');
			} else if (fmt === 'xlsx') {
				const blob = toXLSXBlob(cleanedEmails);
				triggerDownload(`${base}.xlsx`, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			}
		};
	} catch (err) {
		console.error(err);
		alert('Error: ' + err.message);
		summaryEl.textContent = 'Error occurred.';
	} finally {
		cleanBtn.textContent = originalBtnText;
		cleanBtn.disabled = false;
	}
});
