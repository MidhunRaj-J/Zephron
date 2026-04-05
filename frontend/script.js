const STORAGE_KEY = "zephron-state-v1";
const DEFAULT_GREETING = {
	id: cryptoRandomId(),
	role: "assistant",
	text: "Zephron is ready. Ask me for the time, add a task, save a note, or type a command like 'help me plan the day'.",
	time: new Date().toISOString(),
};

const state = loadState();

const elements = {
	messageList: document.getElementById("message-list"),
	composer: document.getElementById("composer"),
	input: document.getElementById("assistant-input"),
	taskForm: document.getElementById("task-form"),
	taskInput: document.getElementById("task-input"),
	taskList: document.getElementById("task-list"),
	noteInput: document.getElementById("note-input"),
	noteList: document.getElementById("note-list"),
	messageCount: document.getElementById("message-count"),
	taskCount: document.getElementById("task-count"),
	noteCount: document.getElementById("note-count"),
	clockTime: document.getElementById("clock-time"),
	clockDate: document.getElementById("clock-date"),
	status: document.getElementById("assistant-status"),
	contextText: document.getElementById("context-text"),
	focusStat: document.getElementById("focus-stat"),
	assistantMode: document.getElementById("assistant-mode"),
	voiceToggle: document.getElementById("voice-toggle"),
	micButton: document.getElementById("mic-button"),
	clearChat: document.getElementById("clear-chat"),
	saveNote: document.getElementById("save-note"),
	clearNotes: document.getElementById("clear-notes"),
};

let voiceEnabled = false;
let recognition = null;

const quickActions = Array.from(document.querySelectorAll("[data-prompt]"));
const actionButtons = Array.from(document.querySelectorAll(".action-button[data-prompt]"));

function loadState() {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {
				messages: [DEFAULT_GREETING],
				tasks: [
					{ id: cryptoRandomId(), text: "Review Zephron project shell", done: false },
					{ id: cryptoRandomId(), text: "Add voice and note workflows", done: true },
				],
				notes: [
					{ id: cryptoRandomId(), text: "Zephron is now a browser-first assistant dashboard." },
				],
				voice: false,
			};
		}
		const parsed = JSON.parse(raw);
		return {
			messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : [DEFAULT_GREETING],
			tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
			notes: Array.isArray(parsed.notes) ? parsed.notes : [],
			voice: Boolean(parsed.voice),
		};
	} catch (error) {
		return {
			messages: [DEFAULT_GREETING],
			tasks: [],
			notes: [],
			voice: false,
		};
	}
}

function saveState() {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cryptoRandomId() {
	if (window.crypto && typeof window.crypto.randomUUID === "function") {
		return window.crypto.randomUUID();
	}
	return Math.random().toString(36).slice(2, 10);
}

function formatTime(date) {
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatDate(date) {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(date);
}

function escapeHtml(value) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function updateClock() {
	const now = new Date();
	elements.clockTime.textContent = formatTime(now);
	elements.clockDate.textContent = formatDate(now);
}

function setContext(message, mode = "Focus") {
	elements.contextText.textContent = message;
	elements.assistantMode.textContent = mode;
	elements.focusStat.textContent = mode;
}

function setStatus(value) {
	elements.status.textContent = value;
}

function renderMessages() {
	elements.messageList.innerHTML = state.messages
		.map((message) => {
			const time = formatTime(new Date(message.time));
			return `
				<article class="message ${message.role}">
					<div class="message-meta">
						<span>${message.role === "assistant" ? "Zephron" : "You"}</span>
						<time>${time}</time>
					</div>
					<p>${escapeHtml(message.text)}</p>
				</article>
			`;
		})
		.join("");
	elements.messageCount.textContent = String(state.messages.length);
	elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function renderTasks() {
	elements.taskList.innerHTML = state.tasks
		.map(
			(task) => `
				<li class="list-item ${task.done ? "done" : ""}">
					<label>
						<input type="checkbox" data-task-toggle="${task.id}" ${task.done ? "checked" : ""} />
						<span>${escapeHtml(task.text)}</span>
					</label>
					<button class="icon-button remove-button" type="button" data-task-delete="${task.id}">×</button>
				</li>
			`,
		)
		.join("");
	elements.taskCount.textContent = String(state.tasks.length);
}

function renderNotes() {
	elements.noteList.innerHTML = state.notes
		.slice()
		.reverse()
		.map(
			(note) => `
				<li class="list-item note-item">
					<span>${escapeHtml(note.text)}</span>
				</li>
			`,
		)
		.join("");
	elements.noteCount.textContent = String(state.notes.length);
}

function renderAll() {
	renderMessages();
	renderTasks();
	renderNotes();
	elements.voiceToggle.textContent = voiceEnabled ? "Voice on" : "Voice off";
}

function addMessage(role, text) {
	state.messages.push({
		id: cryptoRandomId(),
		role,
		text,
		time: new Date().toISOString(),
	});
	saveState();
	renderMessages();
}

function addTask(text) {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}
	state.tasks.unshift({
		id: cryptoRandomId(),
		text: trimmed,
		done: false,
	});
	saveState();
	renderTasks();
	setContext(`Task added: ${trimmed}`, "Focus");
	return true;
}

function addNote(text) {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}
	state.notes.push({
		id: cryptoRandomId(),
		text: trimmed,
	});
	saveState();
	renderNotes();
	setContext(`Note saved: ${trimmed.slice(0, 80)}`, "Capture");
	return true;
}

function clearAssistantHistory() {
	state.messages = [DEFAULT_GREETING];
	saveState();
	renderMessages();
	setContext("Conversation cleared.", "Reset");
}

function clearAllNotes() {
	state.notes = [];
	saveState();
	renderNotes();
	setContext("Notes cleared.", "Capture");
}

function parseTaskCommand(text) {
	const addPatterns = [
		/^add (?:a )?task[:\-]?\s+(.*)$/i,
		/^remind me to\s+(.*)$/i,
		/^task[:\-]?\s+(.*)$/i,
	];
	for (const pattern of addPatterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	return null;
}

function parseNoteCommand(text) {
	const addPatterns = [/^note[:\-]?\s+(.*)$/i, /^write a note[:\-]?\s+(.*)$/i, /^save note[:\-]?\s+(.*)$/i];
	for (const pattern of addPatterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	return null;
}

function summarizeTasks() {
	if (!state.tasks.length) {
		return "You do not have any tasks yet.";
	}
	const remaining = state.tasks.filter((task) => !task.done).length;
	return `${state.tasks.length} tasks total, ${remaining} still open.`;
}

function respond(input) {
	const text = input.trim();
	const lower = text.toLowerCase();
	const now = new Date();

	if (!text) {
		return "I did not catch that.";
	}

	const noteCommand = parseNoteCommand(text);
	if (noteCommand) {
		addNote(noteCommand);
		return `Saved that note: ${noteCommand}`;
	}

	const taskCommand = parseTaskCommand(text);
	if (taskCommand) {
		addTask(taskCommand);
		return `Task added: ${taskCommand}`;
	}

	if (lower.includes("clear notes")) {
		clearAllNotes();
		return "Notes cleared.";
	}

	if (lower.includes("clear tasks")) {
		state.tasks = [];
		saveState();
		renderTasks();
		setContext("Tasks cleared.", "Focus");
		return "Tasks cleared.";
	}

	if (lower.includes("list my tasks") || lower === "tasks" || lower.includes("show tasks")) {
		return summarizeTasks();
	}

	if (lower.includes("what time") || lower.includes("current time")) {
		return `It is ${formatTime(now)}.`;
	}

	if (lower.includes("what day") || lower.includes("date")) {
		return `Today is ${formatDate(now)}.`;
	}

	if (lower.includes("help")) {
		return "Try: add task, save note, list my tasks, what time is it, or tell me to open a website.";
	}

	if (lower.includes("open ")) {
		const target = text.slice(text.toLowerCase().indexOf("open ") + 5).trim();
		window.open(target.startsWith("http") ? target : `https://${target}`, "_blank", "noopener,noreferrer");
		return `Opening ${target}.`;
	}

	if (lower.includes("plan my day") || lower.includes("help me plan")) {
		setContext("Planning mode active.", "Plan");
		return `Start with one priority task, block a focused work window, and keep one small admin task for later.`;
	}

	if (lower.includes("hello") || lower.includes("hi")) {
		return "Hello. I am ready whenever you are.";
	}

	if (lower.includes("who are you")) {
		return "I am Zephron, your local personal assistant dashboard.";
	}

	return `I heard: ${text}. I can add tasks, save notes, tell the time, or open a website.`;
}

function sendMessage(text) {
	const trimmed = text.trim();
	if (!trimmed) {
		return;
	}

	setStatus("Thinking");
	setContext(`Processing: ${trimmed.slice(0, 60)}`, "Active");
	addMessage("user", trimmed);
	const reply = respond(trimmed);
	addMessage("assistant", reply);
	setStatus("Ready");
	speak(reply);
}

function speak(text) {
	if (!voiceEnabled || !("speechSynthesis" in window)) {
		return;
	}
	window.speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.rate = 1;
	utterance.pitch = 1;
	utterance.volume = 0.9;
	window.speechSynthesis.speak(utterance);
}

function setupRecognition() {
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	if (!SpeechRecognition) {
		elements.micButton.disabled = true;
		elements.micButton.title = "Voice recognition is not supported in this browser.";
		return null;
	}

	const instance = new SpeechRecognition();
	instance.lang = "en-US";
	instance.interimResults = false;
	instance.continuous = false;
	instance.onstart = () => setStatus("Listening");
	instance.onresult = (event) => {
		const transcript = event.results[0][0].transcript;
		elements.input.value = transcript;
		sendMessage(transcript);
	};
	instance.onerror = () => setStatus("Ready");
	instance.onend = () => setStatus("Ready");
	return instance;
}

function toggleVoice() {
	voiceEnabled = !voiceEnabled;
	state.voice = voiceEnabled;
	saveState();
	renderAll();
	setContext(voiceEnabled ? "Voice feedback enabled." : "Voice feedback disabled.", voiceEnabled ? "Voice" : "Focus");
}

function toggleTask(taskId) {
	const task = state.tasks.find((item) => item.id === taskId);
	if (!task) {
		return;
	}
	task.done = !task.done;
	saveState();
	renderTasks();
	setContext(task.done ? `Completed: ${task.text}` : `Reopened: ${task.text}`, "Focus");
}

function deleteTask(taskId) {
	state.tasks = state.tasks.filter((task) => task.id !== taskId);
	saveState();
	renderTasks();
}

function wireEvents() {
	elements.composer.addEventListener("submit", (event) => {
		event.preventDefault();
		sendMessage(elements.input.value);
		elements.input.value = "";
		elements.input.focus();
	});

	elements.taskForm.addEventListener("submit", (event) => {
		event.preventDefault();
		if (addTask(elements.taskInput.value)) {
			elements.taskInput.value = "";
		}
	});

	elements.messageList.addEventListener("click", () => {
		elements.input.focus();
	});

	elements.messageList.addEventListener("keydown", () => {
		elements.input.focus();
	});

	document.addEventListener("click", (event) => {
		const promptButton = event.target.closest("[data-prompt]");
		if (promptButton) {
			sendMessage(promptButton.getAttribute("data-prompt"));
		}

		const taskToggle = event.target.closest("[data-task-toggle]");
		if (taskToggle) {
			toggleTask(taskToggle.getAttribute("data-task-toggle"));
		}

		const taskDelete = event.target.closest("[data-task-delete]");
		if (taskDelete) {
			deleteTask(taskDelete.getAttribute("data-task-delete"));
		}
	});

	elements.voiceToggle.addEventListener("click", toggleVoice);
	elements.clearChat.addEventListener("click", clearAssistantHistory);
	elements.saveNote.addEventListener("click", () => {
		if (addNote(elements.noteInput.value)) {
			elements.noteInput.value = "";
		}
	});
	elements.clearNotes.addEventListener("click", clearAllNotes);
	elements.micButton.addEventListener("click", () => {
		if (!recognition) {
			return;
		}
		try {
			recognition.start();
		} catch (error) {
			setStatus("Ready");
		}
	});

	document.querySelectorAll(".chip, .action-button[data-prompt]").forEach((button) => {
		button.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				sendMessage(button.getAttribute("data-prompt"));
			}
		});
	});
}

function initialize() {
	voiceEnabled = Boolean(state.voice);
	recognition = setupRecognition();
	updateClock();
	renderAll();
	wireEvents();
	setInterval(updateClock, 1000);
	setStatus("Ready");
	setContext("Ready for a command.", voiceEnabled ? "Voice" : "Focus");

	actionButtons.forEach((button) => {
		button.addEventListener("click", () => sendMessage(button.getAttribute("data-prompt") || ""));
	});

	quickActions.forEach((button) => {
		button.setAttribute("type", "button");
	});
}

window.addEventListener("load", initialize);