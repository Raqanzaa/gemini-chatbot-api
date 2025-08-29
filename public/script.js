const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const submitButton = form.querySelector('button[type="submit"]');
const API_ENDPOINT = '/api/chat';

/**
 * A more robust and safe Markdown to HTML converter.
 * Supports:
 * - Headings (h1-h6)
 * - Horizontal Rules (---, ***, ___)
 * - Code blocks (```) with language detection
 * - Unordered lists (* or -)
 * - Ordered lists (1.)
 * - Bold (**)
 * - Italic (*)
 * - Italic (*)
 * - Inline code (`)
 * - Paragraphs
 * @param {string} markdown - The markdown text to convert.
 * @returns {string} The converted HTML.
 */
function markdownToHtml(markdown) {
    const text = String(markdown);

    // Helper to escape HTML special characters for security
    const escapeHtml = (str) =>
        str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Process inline elements like bold, italic, and inline code
    const processInline = (line) =>
        escapeHtml(line)
        .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    // First, separate code blocks to treat them as atomic units
    const blocks = text.split(/(```[\s\S]*?```)/);

    const html = blocks.map(block => {
        // It's a code block, format it and skip other processing
        if (block.startsWith('```')) {
            const langMatch = block.match(/```(\w*)\n/);
            const lang = langMatch ? langMatch[1] : '';
            const code = block.replace(/```\w*\n?/, '').replace(/```$/, '');
            const langClass = lang ? ` class="language-${lang}"` : '';
            return `<pre><code${langClass}>${escapeHtml(code.trim())}</code></pre>`;
        }

        // Process all other block-level elements line by line
        const lines = block.trim().split('\n');
        let resultHtml = '';
        let inList = null; // Can be 'ul' or 'ol'
        let paragraphContent = '';

        const closeParagraph = () => {
            if (paragraphContent) {
                resultHtml += `<p>${paragraphContent}</p>`;
                paragraphContent = '';
            }
        };

        const closeList = () => {
            if (inList) {
                resultHtml += `</${inList}>`;
                inList = null;
            }
        };

        for (const line of lines) {
            // Headings (h1-h6)
            const hMatch = line.match(/^\s*(#{1,6})\s+(.*)/);
            if (hMatch) {
                closeParagraph();
                closeList();
                const level = hMatch[1].length;
                resultHtml += `<h${level}>${processInline(hMatch[2])}</h${level}>`;
                continue;
            }

            // Horizontal Rule
            const hrMatch = line.match(/^\s*(\-\-\-|\*\*\*|\_\_\_)\s*$/);
            if (hrMatch) {
                closeParagraph();
                closeList();
                resultHtml += '<hr>';
                continue;
            }

            // Unordered List
            const ulMatch = line.match(/^\s*[\-\*]\s+(.*)/);
            if (ulMatch) {
                closeParagraph();
                if (inList !== 'ul') {
                    closeList();
                    resultHtml += '<ul>';
                    inList = 'ul';
                }
                resultHtml += `<li>${processInline(ulMatch[1])}</li>`;
                continue;
            }

            // Ordered List
            const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
            if (olMatch) {
                closeParagraph();
                if (inList !== 'ol') {
                    closeList();
                    resultHtml += '<ol>';
                    inList = 'ol';
                }
                resultHtml += `<li>${processInline(olMatch[1])}</li>`;
                continue;
            }

            // If we are here, it's not a special block element.
            // So if we were in a list, the list must end.
            closeList();

            // Handle paragraphs
            if (line.trim()) {
                if (paragraphContent) {
                    paragraphContent += '<br>';
                }
                paragraphContent += processInline(line);
            } else {
                // An empty line signifies the end of a paragraph
                closeParagraph();
            }
        }

        // Close any remaining open tags at the end of the block
        closeParagraph();
        closeList();

        return resultHtml;

    }).join('');

    return html;
}


/**
 * Appends a message to the chat box.
 * @param {string} sender - The sender ('user' or 'bot').
 * @param {string} content - The message content (text or HTML).
 * @param {object} [options={}] - Options for appending.
 * @param {boolean} [options.isHtml=false] - Whether the content is HTML.
 * @returns {HTMLElement} The newly created message element.
 */
function appendMessage(sender, content, { isHtml = false } = {}) {
    const row = document.createElement('div');
    row.classList.add('message-row', sender);

    const message = document.createElement('div');
    message.classList.add('message', sender);

    if (isHtml) {
        message.innerHTML = content;
    } else {
        message.textContent = content;
    }

    row.appendChild(message);
    chatBox.appendChild(row);
    // Scroll to the bottom of the chat box to show the latest message
    chatBox.scrollTop = chatBox.scrollHeight;

    return message; // Return the inner message div for updates
}

/**
 * Toggles the disabled state of the chat form.
 * @param {boolean} isDisabled - Whether the form should be disabled.
 */
function setFormDisabled(isDisabled) {
    input.disabled = isDisabled;
    submitButton.disabled = isDisabled;
    if (isDisabled) {
        submitButton.textContent = 'Sending...';
    } else {
        submitButton.textContent = 'Send';
    }
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const userMessage = input.value.trim();
    if (!userMessage || submitButton.disabled) {
        return;
    }

    setFormDisabled(true);
    appendMessage('user', userMessage);
    input.value = '';

    const thinkingMessageElement = appendMessage('bot', 'Thinking...');

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [{
                    role: 'user',
                    content: userMessage
                }],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Could not read error response.');
            throw new Error(`Server error: ${response.status} ${response.statusText}. ${errorText}`);
        }

        const data = await response.json();

        if (data && data.result) {
            thinkingMessageElement.innerHTML = markdownToHtml(data.result);
        } else {
            thinkingMessageElement.textContent = 'Sorry, no response received.';
        }
    } catch (error) {
        console.error('Failed to get response:', error);
        thinkingMessageElement.textContent = 'Failed to get response from server.';
    } finally {
        setFormDisabled(false);
        input.focus(); // Re-focus the input for the next message
    }
});
