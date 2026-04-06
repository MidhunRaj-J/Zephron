const STORAGE_KEY = "zephron-jarvis-state-v1";

const DEFAULT_GREETING = {
    id: createId(),
    role: "assistant",
    text: "Jarvis mode online. Turn on Always listen for continuous voice control.",
    time: new Date().toISOString(),
};

const state = loadState();

const elements = {
    status: document.getElementById("assistant-status"),
    listenState: document.getElementById("listen-state"),
    contextText: document.getElementById("context-text"),
    clockTime: document.getElementById("clock-time"),
    reactor: document.getElementById("reactor"),
    speakToggle: document.getElementById("speak-toggle"),
    continuousToggle: document.getElementById("continuous-toggle"),
    micButton: document.getElementById("mic-button"),
    clearChat: document.getElementById("clear-chat"),
    messageList: document.getElementById("message-list"),
    composer: document.getElementById("composer"),
    input: document.getElementById("assistant-input"),
};

let recognition = null;
let recognitionSupported = false;
let isListening = false;
let shouldKeepListening = false;
let isSpeaking = false;

function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                messages: [DEFAULT_GREETING],
                voiceReply: false,
                alwaysListen: false,
            };
        }

        const parsed = JSON.parse(raw);
        return {
            messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : [DEFAULT_GREETING],
            voiceReply: Boolean(parsed.voiceReply),
            alwaysListen: Boolean(parsed.alwaysListen),
        };
    } catch (error) {
        return {
            messages: [DEFAULT_GREETING],
            voiceReply: false,
            alwaysListen: false,
        };
    }
}

function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(date) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
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

function setStatus(label) {
    elements.status.textContent = label;
}

function setContext(text) {
    elements.contextText.textContent = text;
}

function setListeningUi(active) {
    elements.listenState.textContent = active ? "On" : "Off";
    elements.reactor.classList.toggle("listening", active);
}

function setSpeakingUi(active) {
    elements.reactor.classList.toggle("speaking", active);
}

function addMessage(role, text) {
    state.messages.push({
        id: createId(),
        role,
        text,
        time: new Date().toISOString(),
    });
    saveState();
    renderMessages();
}

function renderMessages() {
    elements.messageList.innerHTML = state.messages
        .map((message) => {
            const time = formatTime(new Date(message.time));
            const name = message.role === "assistant" ? "Zephron" : "You";
            return `
                <article class="message ${message.role}">
                    <div class="meta">
                        <span>${name}</span>
                        <time>${time}</time>
                    </div>
                    <p>${escapeHtml(message.text)}</p>
                </article>
            `;
        })
        .join("");

    elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function updateClock() {
    elements.clockTime.textContent = formatTime(new Date());
}

function clearLog() {
    state.messages = [DEFAULT_GREETING];
    saveState();
    renderMessages();
    setContext("Conversation log cleared.");
}

function getReply(input) {
    const text = input.trim();
    const lower = text.toLowerCase();

    if (!text) {
        return "I did not catch that.";
    }

    if (lower.includes("time")) {
        return `It is ${formatTime(new Date())}.`;
    }

    if (lower.includes("date") || lower.includes("day")) {
        return `Today is ${new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}.`;
    }

    if (lower.startsWith("open ")) {
        const target = text.slice(5).trim();
        if (target) {
            window.open(target.startsWith("http") ? target : `https://${target}`, "_blank", "noopener,noreferrer");
            return `Opening ${target}.`;
        }
    }

    if (lower.includes("stop listening") || lower.includes("disable listening")) {
        state.alwaysListen = false;
        saveState();
        stopRecognition();
        updateControlLabels();
        return "Always listening is now off.";
    }

    if (lower.includes("start listening") || lower.includes("enable listening")) {
        if (!recognitionSupported) {
            return "Voice recognition is not supported in this browser.";
        }
        state.alwaysListen = true;
        saveState();
        updateControlLabels();
        startRecognition();
        return "Always listening is now on.";
    }

    if (lower.includes("hello") || lower.includes("hi")) {
        return "Hello. I am here and listening when you need me.";
    }

    if (lower.includes("help")) {
        return "You can ask for time, date, open a website, start listening, or stop listening.";
    }

    return `Heard: ${text}`;
}

function speak(text) {
    if (!state.voiceReply || !("speechSynthesis" in window)) {
        return;
    }

    if (isListening) {
        stopRecognition(true);
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.95;

    utterance.onstart = () => {
        isSpeaking = true;
        setStatus("Speaking");
        setSpeakingUi(true);
    };

    utterance.onend = () => {
        isSpeaking = false;
        setSpeakingUi(false);
        setStatus(isListening ? "Listening" : "Ready");
        if (state.alwaysListen) {
            startRecognition();
        }
    };

    utterance.onerror = () => {
        isSpeaking = false;
        setSpeakingUi(false);
        setStatus("Ready");
        if (state.alwaysListen) {
            startRecognition();
        }
    };

    window.speechSynthesis.speak(utterance);
}

function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return;
    }

    addMessage("user", trimmed);
    setStatus("Thinking");
    setContext(`Heard: ${trimmed.slice(0, 70)}`);

    const reply = getReply(trimmed);

    addMessage("assistant", reply);
    setStatus(isListening ? "Listening" : "Ready");
    speak(reply);
}

function setupRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        recognitionSupported = false;
        elements.micButton.disabled = true;
        elements.continuousToggle.disabled = true;
        elements.continuousToggle.classList.add("warn");
        elements.listenState.textContent = "Unsupported";
        setContext("Speech recognition is not supported in this browser.");
        return;
    }

    recognitionSupported = true;
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onstart = () => {
        isListening = true;
        setStatus("Listening");
        setListeningUi(true);
    };

    recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) {
                const transcript = result[0].transcript.trim();
                if (transcript) {
                    elements.input.value = transcript;
                    sendMessage(transcript);
                    elements.input.value = "";
                }
            }
        }
    };

    recognition.onerror = () => {
        setStatus("Ready");
        setListeningUi(false);
        isListening = false;
    };

    recognition.onend = () => {
        isListening = false;
        setListeningUi(false);

        if (shouldKeepListening && !isSpeaking) {
            startRecognition();
            return;
        }

        if (!isSpeaking) {
            setStatus("Ready");
        }
    };
}

function startRecognition() {
    if (!recognitionSupported || !recognition || isListening || isSpeaking) {
        return;
    }

    shouldKeepListening = true;

    try {
        recognition.start();
    } catch (error) {
        setStatus("Ready");
    }
}

function stopRecognition(temporary = false) {
    shouldKeepListening = temporary ? state.alwaysListen : false;

    if (!recognitionSupported || !recognition || !isListening) {
        if (!temporary) {
            setListeningUi(false);
            setStatus("Ready");
        }
        return;
    }

    recognition.stop();

    if (!temporary) {
        setListeningUi(false);
        setStatus("Ready");
    }
}

function updateControlLabels() {
    elements.speakToggle.textContent = `Voice reply: ${state.voiceReply ? "On" : "Off"}`;
    elements.continuousToggle.textContent = `Always listen: ${state.alwaysListen ? "On" : "Off"}`;
}

function wireEvents() {
    elements.composer.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage(elements.input.value);
        elements.input.value = "";
        elements.input.focus();
    });

    elements.speakToggle.addEventListener("click", () => {
        state.voiceReply = !state.voiceReply;
        saveState();
        updateControlLabels();
        setContext(state.voiceReply ? "Voice replies enabled." : "Voice replies disabled.");
    });

    elements.continuousToggle.addEventListener("click", () => {
        if (!recognitionSupported) {
            return;
        }

        state.alwaysListen = !state.alwaysListen;
        saveState();
        updateControlLabels();

        if (state.alwaysListen) {
            setContext("Always listening enabled.");
            startRecognition();
        } else {
            setContext("Always listening disabled.");
            shouldKeepListening = false;
            stopRecognition();
        }
    });

    elements.micButton.addEventListener("click", () => {
        if (!recognitionSupported) {
            return;
        }

        state.alwaysListen = false;
        saveState();
        updateControlLabels();
        shouldKeepListening = false;

        if (isListening) {
            stopRecognition();
            return;
        }

        startRecognition();
    });

    elements.clearChat.addEventListener("click", clearLog);
}

function initialize() {
    setupRecognition();
    updateControlLabels();
    updateClock();
    renderMessages();
    wireEvents();

    setInterval(updateClock, 1000);

    setStatus("Ready");
    setContext("Waiting for your command.");

    if (state.alwaysListen && recognitionSupported) {
        startRecognition();
    }
}

window.addEventListener("load", initialize);
