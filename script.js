// --- Mobile Menu Functionality (Existing) ---
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.createElement('div');
const mobileMenuOverlay = document.createElement('div');

function createMobileMenu() {
    mobileMenuOverlay.className = 'mobile-menu-overlay';
    document.body.appendChild(mobileMenuOverlay);
    
    mobileMenu.className = 'mobile-menu';
    
    const mainNav = document.getElementById('mainNav');
    // Simple copy of navigation links
    const navItems = mainNav ? mainNav.querySelector('ul').innerHTML : `
        <ul>
            <li><a href="index.html">Home</a></li>
            <li><a href="properties.html">Properties</a></li>
            <li><a href="land.html">Land for Sale</a></li>
            <li><a href="commercial.html">Commercial</a></li>
            <li><a href="about.html">About Us</a></li>
            <li><a href="contact.html">Contact</a></li>
        </ul>
    `;
    
    // Add CTA buttons for mobile convenience
    const ctaButtons = `
        <div style="padding: 20px 0; border-top: 1px solid rgba(255, 255, 255, 0.1);">
            <a href="login.html" class="btn btn-outline btn-full-width" style="margin-bottom: 10px;">Client Login</a>
            <a href="valuation.html" class="btn btn-primary btn-full-width">Free Valuation</a>
        </div>
    `;

    mobileMenu.innerHTML = `
        <button class="mobile-menu-close" aria-label="Close mobile menu">
            <i class="fas fa-times"></i>
        </button>
        <nav><ul>${navItems}</ul></nav>
        ${ctaButtons}
    `;
    
    document.body.appendChild(mobileMenu);
    
    // Check current page and apply active class to mobile links
    const currentPage = window.location.pathname.split('/').pop();
    const links = mobileMenu.querySelectorAll('a');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });
}

function toggleMobileMenu() {
    mobileMenu.classList.toggle('open');
    mobileMenuOverlay.classList.toggle('open');
}

function closeMobileMenu() {
    mobileMenu.classList.remove('open');
    mobileMenuOverlay.classList.remove('open');
}

if (mobileMenuBtn) {
    createMobileMenu();
    mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    
    const closeBtn = mobileMenu.querySelector('.mobile-menu-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeMobileMenu);
    }
    
    const mobileLinks = mobileMenu.querySelectorAll('a');
    mobileLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
}

// --- AI Chat Assistant Functionality (New) ---
const aiChatButton = document.getElementById('aiChatButton');
const aiChatWidget = document.getElementById('aiChatWidget');
const closeChatButton = document.getElementById('closeChatButton');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendButton = document.getElementById('chatSendButton');

let chatHistory = [];
let isAILoading = false;

const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';
const API_KEY = ""; // Canvas runtime provides this
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// System instruction for the AI persona
const SYSTEM_INSTRUCTION = `You are Asotabsicon AI Assistant, a professional and helpful real estate and land investment consultant. Your goal is to assist website visitors with property inquiries, market information, and company services (like valuation and consultation). Keep responses concise, professional, and focus on encouraging users to browse listings or schedule a consultation. Use Google Search grounding for real-time market data or property information when appropriate.`;

// Firestore state management
let fsChatDocRef = null;

/**
 * Renders a new message to the chat interface.
 * @param {string} text The message content.
 * @param {('user'|'ai'|'system')} sender The sender role.
 * @param {Array<{uri: string, title: string}>} sources Array of grounding sources.
 */
function displayMessage(text, sender, sources = []) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;

    // Process text for markdown (basic line breaks)
    const formattedText = text.replace(/\n/g, '<br>');

    // Add text content
    let contentHTML = `<p>${formattedText}</p>`;

    // Add source citations if available
    if (sources.length > 0) {
        contentHTML += '<div class="sources-list" style="margin-top: 10px; font-size: 0.75rem; color: var(--text-gray);">';
        contentHTML += '<p style="font-weight: 600;">Sources:</p>';
        sources.forEach((source, index) => {
            contentHTML += `<a href="${source.uri}" target="_blank" style="display: block; color: var(--text-gray); text-decoration: underline;">[${index + 1}] ${source.title}</a>`;
        });
        contentHTML += '</div>';
    }

    messageElement.innerHTML = contentHTML;
    chatMessages.appendChild(messageElement);

    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Toggles the visibility of the loading indicator.
 * @param {boolean} show Whether to show or hide the indicator.
 */
function toggleLoading(show) {
    const loadingId = 'aiLoadingIndicator';
    let loadingElement = document.getElementById(loadingId);

    if (show) {
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = loadingId;
            loadingElement.className = 'loading-indicator ai-message';
            loadingElement.innerHTML = 'AI is typing<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            chatMessages.appendChild(loadingElement);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
        chatInput.disabled = true;
        chatSendButton.disabled = true;
        isAILoading = true;
    } else {
        if (loadingElement) {
            loadingElement.remove();
        }
        chatInput.disabled = false;
        chatSendButton.disabled = false;
        isAILoading = false;
        chatInput.focus();
    }
}

/**
 * Saves the current chat history to Firestore.
 */
async function saveChatHistory() {
    if (!window.db || !window.auth || !window.appId || !fsChatDocRef) {
        return;
    }
    
    try {
        await setDoc(fsChatDocRef, { 
            history: chatHistory, 
            lastUpdated: new Date() 
        }, { merge: true });
    } catch (e) {
        console.error("Error saving chat history to Firestore: ", e);
    }
}

/**
 * Loads previous chat history from Firestore or sets up a new one.
 */
async function loadChatHistory() {
    if (!window.db || !window.auth || !window.appId || !window.auth.currentUser) {
        // Fallback for immediate use before full auth is ready
        fsChatDocRef = doc(collection(window.db, `artifacts/${window.appId}/users/temp_user/chats`), 'ai_assistant');
        // Initial setup message if no history loaded
        if (chatHistory.length === 0) {
            displayMessage("Hello! I am Asotabsicon AI Assistant. How can I help you find your next property or investment opportunity today? You can ask about our featured listings or general market trends.", 'ai');
        }
        return;
    }

    const userId = window.auth.currentUser.uid;
    fsChatDocRef = doc(collection(window.db, `artifacts/${window.appId}/users/${userId}/chats`), 'ai_assistant');

    try {
        const docSnap = await getDoc(fsChatDocRef);
        if (docSnap.exists() && docSnap.data().history) {
            chatHistory = docSnap.data().history;
            chatHistory.forEach(msg => displayMessage(msg.parts[0].text, msg.role));
        } else {
            // Initial AI greeting
            displayMessage("Hello! I am Asotabsicon AI Assistant. How can I help you find your next property or investment opportunity today? You can ask about our featured listings or general market trends.", 'ai');
        }
    } catch (e) {
        console.error("Error loading chat history from Firestore: ", e);
        // Fallback greeting if load fails
        if (chatHistory.length === 0) {
             displayMessage("Hello! I am Asotabsicon AI Assistant. How can I help you find your next property or investment opportunity today? You can ask about our featured listings or general market trends.", 'ai');
        }
    }
}


/**
 * Sends a message to the Gemini API with exponential backoff.
 * @param {string} message The user's message.
 * @param {number} retryCount The current retry attempt.
 */
async function sendMessageToAPI(message, retryCount = 0) {
    const userMessage = { role: "user", parts: [{ text: message }] };
    chatHistory.push(userMessage);
    
    const payload = {
        contents: chatHistory,
        tools: [{ "google_search": {} }], // Enable search grounding
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return sendMessageToAPI(message, retryCount + 1); // Retry
            }
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];
        
        let aiText = "I apologize, I ran into an issue finding a suitable response.";
        let sources = [];
        
        if (candidate && candidate.content?.parts?.[0]?.text) {
            aiText = candidate.content.parts[0].text;
            
            // Extract grounding sources
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title);
            }
        }
        
        const aiMessage = { role: "model", parts: [{ text: aiText }] };
        chatHistory.push(aiMessage);
        displayMessage(aiText, 'ai', sources);
        saveChatHistory();

    } catch (error) {
        console.error("Gemini API error:", error);
        const errorMessage = "Sorry, I'm currently unable to connect to the assistant. Please try again later or contact our support team directly.";
        displayMessage(errorMessage, 'ai');
        
        const errorMessageObj = { role: "model", parts: [{ text: errorMessage }] };
        chatHistory.push(errorMessageObj);
        saveChatHistory();
    } finally {
        toggleLoading(false);
    }
}

/**
 * Handles the user sending a message.
 */
function handleSendMessage() {
    const message = chatInput.value.trim();
    if (message === '' || isAILoading) {
        return;
    }

    // 1. Display user message
    displayMessage(message, 'user');
    chatInput.value = '';

    // 2. Show loading indicator
    toggleLoading(true);

    // 3. Send to API
    sendMessageToAPI(message);
}


// --- Event Listeners and Initialization ---

// Chat Button Toggles
aiChatButton.addEventListener('click', () => {
    aiChatWidget.classList.toggle('open');
    if (aiChatWidget.classList.contains('open')) {
        chatInput.focus();
    }
});

closeChatButton.addEventListener('click', () => {
    aiChatWidget.classList.remove('open');
});

// Send button and Enter key handlers
chatSendButton.addEventListener('click', handleSendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSendMessage();
    }
});

// Initialize chat and load history after Firebase Auth is likely complete
window.addEventListener('load', () => {
    // Wait a moment for Firebase initialization
    setTimeout(() => {
        loadChatHistory();
    }, 1500); 
});
const fsChatDocRef = doc(collection(window.db, `artifacts/${window.appId}/users/${userId}/chats`), 'ai_assistant');
// Add at line ~150 (after all Firebase references)
if (!window.db || !window.auth) {
    console.log("Firebase not configured - AI chat limited");
    // Provide basic chat without Firebase
}